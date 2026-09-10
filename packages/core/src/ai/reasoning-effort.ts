import type { AIProviderId, AIReasoningEffort } from './types';

// Weakest to strongest. A model's accepted subset is stored weakest-first (the
// order models.dev publishes) so clamping can walk this list without sorting.
export const REASONING_EFFORT_ORDER: readonly AIReasoningEffort[] = [
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
];

export type ReasoningEffortProfile = {
    // Tiers the model accepts. Empty when the model has thinking on/off but no
    // selectable level, in which case we must not send `reasoning_effort` at all.
    efforts: readonly AIReasoningEffort[];
    // False when the upstream 400s on an explicit `temperature` (OpenAI
    // reasoning models, Kimi K3), so the request omits it.
    supportsTemperature: boolean;
};

// The GPT-5 family and o-series are the ids that behave like reasoning models
// on any OpenAI-compatible endpoint: they reject an explicit temperature and
// take a graded effort. Also the fallback profile for an unknown id, which
// keeps behavior identical to before the per-model table existed.
const OPENAI_FAMILY_REASONING_PATTERN = /^(?:gpt-5|o\d+(?:-|$))/;
const OPENAI_FAMILY_EFFORTS: readonly AIReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];

export function isOpenAIReasoningModel(model: string): boolean {
    return OPENAI_FAMILY_REASONING_PATTERN.test(model.trim().toLowerCase());
}

// OpenCode Go's `GET /v1/models` returns ids only, so the tiers each model
// accepts come from a snapshot of models.dev (https://models.dev/api.json,
// provider `opencode-go`, 2026-09-10). Models absent from this table fall back
// to the GPT-5 heuristic above: a newly listed model keeps working, and its
// effort control appears once the snapshot is refreshed.
//
// Only ids that need an entry are listed: the ones with selectable tiers, plus
// kimi-k2.7-code, which accepts no effort but rejects temperature.
const OPENCODE_GO_PROFILES: Record<string, ReasoningEffortProfile> = {
    'deepseek-flash': { efforts: ['low', 'high', 'max'], supportsTemperature: true },
    'deepseek-v4-flash': { efforts: ['low', 'high', 'max'], supportsTemperature: true },
    'deepseek-v4-flash-vision-exp': { efforts: ['low', 'high', 'max'], supportsTemperature: true },
    'deepseek-v4-pro': { efforts: ['high', 'max'], supportsTemperature: true },
    'glm-5.2': { efforts: ['high', 'max'], supportsTemperature: true },
    'glm-5.3': { efforts: ['low', 'high', 'max'], supportsTemperature: true },
    'glm-5.3-flash': { efforts: ['low', 'high', 'max'], supportsTemperature: true },
    'gpt-5.6-luna': { efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], supportsTemperature: false },
    'grok-4.5': { efforts: ['low', 'medium', 'high'], supportsTemperature: true },
    'grok-4.6': { efforts: ['low', 'medium', 'high', 'xhigh'], supportsTemperature: true },
    'hy3': { efforts: ['none', 'low', 'high'], supportsTemperature: true },
    'hy4-preview': { efforts: ['none', 'high'], supportsTemperature: true },
    'kimi-k2.7-code': { efforts: [], supportsTemperature: false },
    'kimi-k3': { efforts: ['max'], supportsTemperature: false },
    'muse-spark-1.2-contributor': { efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'], supportsTemperature: true },
    'muse-spark-1.3-contributor': { efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'], supportsTemperature: true },
    'omen-alpha': { efforts: ['low', 'high'], supportsTemperature: true },
    'qwen3.8-flash': { efforts: ['low', 'medium', 'xhigh'], supportsTemperature: true },
    'qwen3.8-max': { efforts: ['low', 'medium', 'xhigh'], supportsTemperature: true },
};

const FALLBACK_PROFILE_FOR_UNKNOWN_MODEL: ReasoningEffortProfile = {
    efforts: [],
    supportsTemperature: true,
};

export function getOpenCodeGoReasoningProfile(model: string): ReasoningEffortProfile {
    const id = model.trim().toLowerCase();
    const known = OPENCODE_GO_PROFILES[id];
    if (known) return known;
    if (!isOpenAIReasoningModel(id)) return FALLBACK_PROFILE_FOR_UNKNOWN_MODEL;
    return { efforts: OPENAI_FAMILY_EFFORTS, supportsTemperature: false };
}

/**
 * Picks the tier to send for a model. A requested tier the model does not accept
 * (a stored setting from another model, or the copilot's fixed tier) becomes the
 * nearest accepted one, with ties resolved down to the cheaper tier. Returns
 * undefined when the model accepts no tiers or the request is not a known tier.
 *
 * @example clampReasoningEffort('high', ['low', 'max']) // 'max'
 */
export function clampReasoningEffort(
    requested: AIReasoningEffort,
    supported: readonly AIReasoningEffort[],
): AIReasoningEffort | undefined {
    if (supported.length === 0) return undefined;
    if (supported.includes(requested)) return requested;
    const requestedRank = REASONING_EFFORT_ORDER.indexOf(requested);
    if (requestedRank < 0) return undefined;

    let nearest = supported[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of supported) {
        const rank = REASONING_EFFORT_ORDER.indexOf(candidate);
        // Strictly closer wins, so an equal-distance pair keeps the weaker tier
        // (the list is weakest-first) instead of silently spending more tokens.
        const distance = Math.abs(rank - requestedRank);
        if (distance < nearestDistance) {
            nearest = candidate;
            nearestDistance = distance;
        }
    }
    return nearest;
}

/**
 * Tiers to offer in the settings control for a provider. OpenAI keeps its fixed
 * list (its row is unchanged and only its models show it); OpenCode Go follows
 * the selected model, and an empty result means the row shows only its hint:
 * desktop renders no control and mobile renders no chips.
 */
export function getReasoningEffortOptions(provider: AIProviderId, model: string): AIReasoningEffort[] {
    if (provider !== 'opencode-go') return ['low', 'medium', 'high'];
    return [...getOpenCodeGoReasoningProfile(model).efforts];
}

export type ReasoningEffortLabelKey =
    | 'settings.aiEffortNone'
    | 'settings.aiEffortMinimal'
    | 'settings.aiEffortLow'
    | 'settings.aiEffortMedium'
    | 'settings.aiEffortHigh'
    | 'settings.aiEffortXHigh'
    | 'settings.aiEffortMax';

const REASONING_EFFORT_LABEL_KEYS: Record<AIReasoningEffort, ReasoningEffortLabelKey> = {
    none: 'settings.aiEffortNone',
    minimal: 'settings.aiEffortMinimal',
    low: 'settings.aiEffortLow',
    medium: 'settings.aiEffortMedium',
    high: 'settings.aiEffortHigh',
    xhigh: 'settings.aiEffortXHigh',
    max: 'settings.aiEffortMax',
};

export function getReasoningEffortLabelKey(effort: AIReasoningEffort): ReasoningEffortLabelKey {
    return REASONING_EFFORT_LABEL_KEYS[effort];
}
