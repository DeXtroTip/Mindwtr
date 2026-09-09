import { describe, expect, it, vi } from 'vitest';

import { buildAIConfig, buildCopilotConfig, resolveEffectiveAIProvider } from './ai-config';

const expoConfigMock = vi.hoisted(() => ({ extra: {} as Record<string, unknown> }));

vi.mock('expo-constants', () => ({
    default: {
        get expoConfig() {
            return { extra: expoConfigMock.extra };
        },
    },
}));

describe('mobile ai-config opencode-go', () => {
    it('carries the interaction session ID and ignores stale base URLs', () => {
        expoConfigMock.extra = {};
        const config = buildAIConfig(
            { ai: { provider: 'opencode-go', model: 'gpt-5.6-luna', baseUrl: 'http://localhost:11434/v1' } },
            'oc-key',
            'session-1',
        );
        expect(config.provider).toBe('opencode-go');
        expect(config.sessionId).toBe('session-1');
        expect(config.endpoint).toBeUndefined();

        const copilot = buildCopilotConfig(
            { ai: { provider: 'opencode-go', copilotModel: 'gpt-5.6-luna' } },
            'oc-key',
            'session-2',
        );
        expect(copilot.sessionId).toBe('session-2');
    });

    it('forces the local provider on FOSS builds with a stale opencode-go setting', () => {
        expoConfigMock.extra = { isFossBuild: true };
        try {
            const config = buildAIConfig(
                { ai: { provider: 'opencode-go', model: 'gpt-5.6-luna' } },
                'oc-key',
                'session-1',
            );
            expect(config.provider).toBe('openai');
            expect(config.sessionId).toBeUndefined();
        } finally {
            expoConfigMock.extra = {};
        }
    });

    it('returns to the local model names when a FOSS build rewrites the provider', () => {
        expoConfigMock.extra = { isFossBuild: true };
        try {
            const config = buildAIConfig(
                { ai: { provider: 'opencode-go', model: 'gpt-5.6-luna', copilotModel: 'kimi-k3' } },
                '',
            );
            expect(config.model).toBe('llama3.2');

            const copilot = buildCopilotConfig(
                { ai: { provider: 'gemini', model: 'gemini-3.6-flash', copilotModel: 'gemini-3.5-flash-lite' } },
                '',
            );
            expect(copilot.model).toBe('llama3.2');
        } finally {
            expoConfigMock.extra = {};
        }
    });
});

describe('resolveEffectiveAIProvider', () => {
    it('keeps the configured provider on a regular build', () => {
        expoConfigMock.extra = {};
        expect(resolveEffectiveAIProvider({ ai: { provider: 'gemini' } })).toBe('gemini');
        expect(resolveEffectiveAIProvider(undefined)).toBe('openai');
    });

    it('reports the local provider on a FOSS build, whatever was synced', () => {
        expoConfigMock.extra = { isFossBuild: true };
        try {
            expect(resolveEffectiveAIProvider({ ai: { provider: 'gemini' } })).toBe('openai');
            expect(resolveEffectiveAIProvider({ ai: { provider: 'anthropic' } })).toBe('openai');
            expect(resolveEffectiveAIProvider({ ai: { provider: 'openai' } })).toBe('openai');
            expect(resolveEffectiveAIProvider(undefined)).toBe('openai');
        } finally {
            expoConfigMock.extra = {};
        }
    });
});

describe('FOSS provider sanitizing', () => {
    it('forces the local provider and its model names', () => {
        expoConfigMock.extra = { isFossBuild: true };
        try {
            const config = buildAIConfig(
                { ai: { provider: 'gemini', model: 'gemini-3.6-flash', copilotModel: 'gemini-3.5-flash-lite' } } as never,
                'gemini-key',
            );
            expect(config.provider).toBe('openai');
            expect(config.model).toBe('llama3.2');

            const copilot = buildCopilotConfig(
                { ai: { provider: 'anthropic', model: 'claude-sonnet-5', copilotModel: 'claude-haiku-4-5' } } as never,
                'anthropic-key',
            );
            expect(copilot.provider).toBe('openai');
            expect(copilot.model).toBe('llama3.2');
        } finally {
            expoConfigMock.extra = {};
        }
    });

    it('leaves a regular build untouched, including a custom local model', () => {
        expoConfigMock.extra = {};
        const config = buildAIConfig(
            { ai: { provider: 'openai', model: 'qwen3:8b', copilotModel: 'phi-4-mini' } } as never,
            '',
        );
        expect(config.provider).toBe('openai');
        expect(config.model).toBe('qwen3:8b');

        const hosted = buildAIConfig({ ai: { provider: 'gemini', model: 'gemini-3.6-flash' } } as never, 'key');
        expect(hosted.provider).toBe('gemini');
        expect(hosted.model).toBe('gemini-3.6-flash');
    });
});
