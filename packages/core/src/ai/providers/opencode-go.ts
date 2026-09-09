import type { AIProvider, AIProviderConfig } from '../types';
import { generateUUID } from '../../uuid';
import {
    createOpenAICompatibleProvider,
    type OpenAICompatibleErrorInfo,
} from './openai-compatible';

export const OPENCODE_GO_CHAT_URL = 'https://opencode.ai/zen/go/v1/chat/completions';
export const OPENCODE_GO_MODELS_URL = 'https://opencode.ai/zen/go/v1/models';
export const OPENCODE_GO_USER_AGENT = 'Mindwtr/1.0';
export const OPENCODE_GO_SESSION_HEADER = 'x-opencode-session';

const resolveSessionId = (value?: string): string => {
    const trimmed = String(value ?? '').trim();
    if (trimmed) return trimmed;
    return generateUUID();
};

function buildOpenCodeGoError(info: OpenAICompatibleErrorInfo): Error {
    const { status, message, code, type, raw } = info;

    if (status === 401) {
        return new Error('OpenCode Go API key is invalid or missing. Check the key in AI settings.');
    }
    if (status === 403) {
        return new Error('OpenCode Go access denied for this model or key.');
    }
    if (status === 404) {
        return new Error('OpenCode Go model not found or unavailable for this key.');
    }
    if (status === 429) {
        return new Error('OpenCode Go rate limit or quota exceeded. Please try again later.');
    }

    const parts = [
        `OpenCode Go request failed (${status})`,
        code ? `[${code}]` : '',
        type ? `(${type})` : '',
        message ? `: ${message}` : '',
        !message && raw ? `: ${raw}` : '',
    ].filter(Boolean);
    return new Error(parts.join(' ').trim());
}

export function createOpenCodeGoProvider(config: AIProviderConfig): AIProvider {
    // Resolve once per provider instance so retries and structured-output
    // fallbacks reuse the same interaction session.
    const sessionId = resolveSessionId(config.sessionId);
    return createOpenAICompatibleProvider(config, {
        label: 'OpenCode Go',
        rateLimitKey: 'opencode-go',
        resolveUrl: () => OPENCODE_GO_CHAT_URL,
        resolveApiKey: (cfg) => String(cfg.apiKey || '').trim(),
        validateConfig: (cfg, _url, apiKey) => {
            if (!apiKey) {
                throw new Error('OpenCode Go API key is required. Add it in AI settings.');
            }
            if (!String(cfg.model ?? '').trim()) {
                throw new Error('Select an OpenCode Go model in AI settings.');
            }
        },
        buildHeaders: (_cfg, apiKey) => ({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'User-Agent': OPENCODE_GO_USER_AGENT,
            [OPENCODE_GO_SESSION_HEADER]: sessionId,
        }),
        buildError: (info) => buildOpenCodeGoError(info),
        preferJsonSchema: () => true,
        getExtraBodyParams: () => ({}),
    });
}
