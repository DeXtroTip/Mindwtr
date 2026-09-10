import { describe, expect, it } from 'vitest';
import {
    REASONING_EFFORT_ORDER,
    clampReasoningEffort,
    getOpenCodeGoReasoningProfile,
    getReasoningEffortLabelKey,
    getReasoningEffortOptions,
    isOpenAIReasoningModel,
} from './reasoning-effort';
import type { AIReasoningEffort } from './types';

describe('OpenCode Go reasoning profiles', () => {
    it('lists the tiers a known model accepts, weakest first', () => {
        expect(getOpenCodeGoReasoningProfile('glm-5.3-flash').efforts).toEqual(['low', 'high', 'max']);
        expect(getOpenCodeGoReasoningProfile('gpt-5.6-luna').efforts)
            .toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
        expect(getOpenCodeGoReasoningProfile('kimi-k3').efforts).toEqual(['max']);
    });

    it('marks the models that reject an explicit temperature', () => {
        expect(getOpenCodeGoReasoningProfile('gpt-5.6-luna').supportsTemperature).toBe(false);
        expect(getOpenCodeGoReasoningProfile('kimi-k3').supportsTemperature).toBe(false);
        expect(getOpenCodeGoReasoningProfile('kimi-k2.7-code').supportsTemperature).toBe(false);
        expect(getOpenCodeGoReasoningProfile('glm-5.3-flash').supportsTemperature).toBe(true);
    });

    it('matches ids case-insensitively after trimming', () => {
        expect(getOpenCodeGoReasoningProfile('  GLM-5.3-Flash ').efforts).toEqual(['low', 'high', 'max']);
    });

    it('reports no tiers for a model whose thinking cannot be tuned', () => {
        expect(getOpenCodeGoReasoningProfile('kimi-k2.6')).toEqual({ efforts: [], supportsTemperature: true });
    });

    it('falls back to the GPT-5 heuristic for ids missing from the snapshot', () => {
        expect(getOpenCodeGoReasoningProfile('gpt-5.9-future').efforts).toEqual(['minimal', 'low', 'medium', 'high']);
        expect(getOpenCodeGoReasoningProfile('gpt-5.9-future').supportsTemperature).toBe(false);
        // A newly listed third-party model keeps today's behavior: no effort field,
        // temperature sent, until the snapshot gains an entry for it.
        expect(getOpenCodeGoReasoningProfile('brand-new-model')).toEqual({ efforts: [], supportsTemperature: true });
    });
});

describe('isOpenAIReasoningModel', () => {
    it('matches the GPT-5 family and o-series only', () => {
        expect(isOpenAIReasoningModel('gpt-5.6-luna')).toBe(true);
        expect(isOpenAIReasoningModel('o3-mini')).toBe(true);
        expect(isOpenAIReasoningModel('o3')).toBe(true);
        expect(isOpenAIReasoningModel('gpt-4o')).toBe(false);
        expect(isOpenAIReasoningModel('glm-5.3-flash')).toBe(false);
        expect(isOpenAIReasoningModel('deepseek-r1')).toBe(false);
    });
});

describe('clampReasoningEffort', () => {
    it('keeps a tier the model accepts', () => {
        expect(clampReasoningEffort('high', ['low', 'high', 'max'])).toBe('high');
    });

    it('moves to the nearest accepted tier', () => {
        expect(clampReasoningEffort('max', ['low', 'high', 'max'])).toBe('max');
        expect(clampReasoningEffort('high', ['none', 'high'])).toBe('high');
        expect(clampReasoningEffort('none', ['low', 'high', 'max'])).toBe('low');
        expect(clampReasoningEffort('xhigh', ['max'])).toBe('max');
    });

    it('resolves an equidistant pair down to the cheaper tier', () => {
        // low(2) and high(4) are both one step from medium(3).
        expect(clampReasoningEffort('medium', ['low', 'high'])).toBe('low');
    });

    it('returns undefined when the model has no tiers', () => {
        expect(clampReasoningEffort('high', [])).toBeUndefined();
    });

    it('returns undefined for a value that is not a known tier', () => {
        expect(clampReasoningEffort('extreme' as AIReasoningEffort, ['low'])).toBeUndefined();
    });

    it('orders every tier weakest to strongest', () => {
        expect(REASONING_EFFORT_ORDER).toEqual(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
    });
});

describe('getReasoningEffortOptions', () => {
    it('keeps the fixed OpenAI list regardless of model', () => {
        expect(getReasoningEffortOptions('openai', 'gpt-5.6-terra')).toEqual(['low', 'medium', 'high']);
        expect(getReasoningEffortOptions('gemini', 'gemini-3.6-flash')).toEqual(['low', 'medium', 'high']);
    });

    it('follows the selected OpenCode Go model', () => {
        expect(getReasoningEffortOptions('opencode-go', 'qwen3.8-flash')).toEqual(['low', 'medium', 'xhigh']);
        expect(getReasoningEffortOptions('opencode-go', 'kimi-k2.6')).toEqual([]);
    });
});

describe('getReasoningEffortLabelKey', () => {
    it('maps every tier to its settings string', () => {
        expect(REASONING_EFFORT_ORDER.map(getReasoningEffortLabelKey)).toEqual([
            'settings.aiEffortNone',
            'settings.aiEffortMinimal',
            'settings.aiEffortLow',
            'settings.aiEffortMedium',
            'settings.aiEffortHigh',
            'settings.aiEffortXHigh',
            'settings.aiEffortMax',
        ]);
    });
});
