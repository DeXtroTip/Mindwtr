import { describe, expect, it, vi } from 'vitest';
import { createAIProvider } from './ai-service';

describe('createAIProvider dispatch', () => {
    it('creates an opencode-go provider', async () => {
        const fetchMock = vi.fn(async () =>
            new Response(
                JSON.stringify({
                    choices: [{ message: { content: JSON.stringify({ steps: ['a'] }) } }],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
        );
        const originalFetch = globalThis.fetch;
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        try {
            const provider = createAIProvider({
                provider: 'opencode-go',
                apiKey: 'oc-key',
                model: 'gpt-5.6-luna',
                sessionId: 's-1',
            });
            const result = await provider.breakDownTask({ title: 'Plan trip' });
            expect(result.steps).toEqual(['a']);
            const [, init] = fetchMock.mock.calls[0] ?? [];
            const headers = ((init as RequestInit | undefined)?.headers ?? {}) as Record<string, string>;
            expect(headers['x-opencode-session']).toBe('s-1');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('rejects unsupported providers', () => {
        expect(() =>
            createAIProvider({ provider: 'unknown' as never, apiKey: '', model: '' }),
        ).toThrow(/Unsupported AI provider/);
    });
});
