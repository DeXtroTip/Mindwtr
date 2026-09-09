import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenCodeGoProvider, OPENCODE_GO_CHAT_URL } from './opencode-go';

const mockSuccess = (payload: unknown) =>
    new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

const clarifyPayload = {
    question: 'What is the next action?',
    options: [{ label: 'Do it', action: 'do' }],
};

const readRequest = (fetchMock: ReturnType<typeof vi.fn>, index = 0) => {
    const [url, init] = fetchMock.mock.calls[index] ?? [];
    return {
        url: String(url ?? ''),
        init: (init ?? {}) as RequestInit,
        headers: ((init as RequestInit | undefined)?.headers ?? {}) as Record<string, string>,
        body: JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')) as Record<string, unknown>,
    };
};

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('opencode-go provider contract', () => {
    it('uses the fixed OpenCode Go endpoint with required headers', async () => {
        const fetchMock = vi.fn(async () => mockSuccess(clarifyPayload));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const provider = createOpenCodeGoProvider({
            provider: 'opencode-go',
            apiKey: 'test-key',
            model: 'gpt-5.6-luna',
            sessionId: 'session-123',
        });

        await provider.clarifyTask({ title: 'Plan trip' });

        const request = readRequest(fetchMock);
        expect(request.url).toBe(OPENCODE_GO_CHAT_URL);
        expect(request.headers.Authorization).toBe('Bearer test-key');
        expect(request.headers['Content-Type']).toBe('application/json');
        expect(request.headers['User-Agent']).toBe('Mindwtr/1.0');
        expect(request.headers['x-opencode-session']).toBe('session-123');
        expect(request.body.model).toBe('gpt-5.6-luna');
    });

    it('ignores custom endpoints and extra body params', async () => {
        const fetchMock = vi.fn(async () => mockSuccess(clarifyPayload));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const provider = createOpenCodeGoProvider({
            provider: 'opencode-go',
            apiKey: 'test-key',
            model: 'gpt-5.6-luna',
            endpoint: 'https://proxy.example.com/v1/chat/completions',
            extraBodyParams: { temperature: 0.9, custom: true },
            sessionId: 'session-123',
        });

        await provider.clarifyTask({ title: 'Plan trip' });

        const request = readRequest(fetchMock);
        expect(request.url).toBe(OPENCODE_GO_CHAT_URL);
        expect(request.body.custom).toBeUndefined();
        // gpt-5.6-luna is a reasoning model, so the default temperature is omitted.
        expect(request.body.temperature).toBeUndefined();
    });

    it('requires an API key before network access', async () => {
        const fetchMock = vi.fn(async () => mockSuccess(clarifyPayload));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const provider = createOpenCodeGoProvider({
            provider: 'opencode-go',
            apiKey: '   ',
            model: 'gpt-5.6-luna',
            sessionId: 'session-123',
        });

        await expect(provider.clarifyTask({ title: 'Plan trip' })).rejects.toThrow(
            'OpenCode Go API key is required.',
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('requires a selected model before network access', async () => {
        const fetchMock = vi.fn(async () => mockSuccess(clarifyPayload));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const provider = createOpenCodeGoProvider({
            provider: 'opencode-go',
            apiKey: 'test-key',
            model: '   ',
            sessionId: 'session-123',
        });

        await expect(provider.clarifyTask({ title: 'Plan trip' })).rejects.toThrow(
            'Select an OpenCode Go model',
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('generates a session ID when the caller omits one', async () => {
        const fetchMock = vi.fn(async () => mockSuccess(clarifyPayload));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const provider = createOpenCodeGoProvider({
            provider: 'opencode-go',
            apiKey: 'test-key',
            model: 'gpt-5.6-luna',
        });

        await provider.clarifyTask({ title: 'Plan trip' });

        const request = readRequest(fetchMock);
        expect(typeof request.headers['x-opencode-session']).toBe('string');
        expect(String(request.headers['x-opencode-session'] ?? '')).not.toBe('');
    });

    it('keeps the same session ID across retries and format fallback', async () => {
        let call = 0;
        const fetchMock = vi.fn(async () => {
            call += 1;
            if (call === 1) {
                return new Response('boom', { status: 503, headers: { 'Content-Type': 'text/plain' } });
            }
            return mockSuccess(clarifyPayload);
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const provider = createOpenCodeGoProvider({
            provider: 'opencode-go',
            apiKey: 'test-key',
            model: 'gpt-5.6-luna',
            sessionId: 'stable-session',
        });

        await provider.clarifyTask({ title: 'Plan trip' });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(readRequest(fetchMock, 0).headers['x-opencode-session']).toBe('stable-session');
        expect(readRequest(fetchMock, 1).headers['x-opencode-session']).toBe('stable-session');
    });

    it('translates auth, model, and rate-limit errors', async () => {
        const cases = [
            { status: 401, message: 'OpenCode Go API key is invalid' },
            { status: 403, message: 'OpenCode Go access denied' },
            { status: 404, message: 'OpenCode Go model not found' },
            { status: 429, message: 'OpenCode Go rate limit' },
        ];
        for (const { status, message } of cases) {
            const fetchMock = vi.fn(async () =>
                new Response(JSON.stringify({ error: { message: 'upstream' } }), {
                    status,
                    headers: { 'Content-Type': 'application/json' },
                }),
            );
            globalThis.fetch = fetchMock as unknown as typeof fetch;
            const provider = createOpenCodeGoProvider({
                provider: 'opencode-go',
                apiKey: 'test-key',
                model: 'gpt-5.6-luna',
                sessionId: 's',
            });
            await expect(provider.clarifyTask({ title: 'x' })).rejects.toThrow(message);
        }
    });

    it('does not leak the session ID in error text', async () => {
        const fetchMock = vi.fn(async () =>
            new Response('gateway exploded', { status: 502, headers: { 'Content-Type': 'text/plain' } }),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const provider = createOpenCodeGoProvider({
            provider: 'opencode-go',
            apiKey: 'test-key',
            model: 'gpt-5.6-luna',
            sessionId: 'secret-session-id',
        });

        await expect(provider.clarifyTask({ title: 'x' })).rejects.toThrow(/OpenCode Go request failed \(502\)/);
        try {
            await provider.clarifyTask({ title: 'x' });
        } catch (error) {
            expect(String((error as Error).message)).not.toContain('secret-session-id');
            return;
        }
        throw new Error('expected clarifyTask to throw');
    });

    it('supports abort signals', async () => {
        globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            if ((init?.signal as AbortSignal | undefined)?.aborted) {
                throw new Error('OpenCode Go request aborted');
            }
            return mockSuccess(clarifyPayload);
        }) as unknown as typeof fetch;

        const provider = createOpenCodeGoProvider({
            provider: 'opencode-go',
            apiKey: 'test-key',
            model: 'gpt-5.6-luna',
            sessionId: 's',
            timeoutMs: 1000,
        });
        const controller = new AbortController();
        controller.abort();
        await expect(provider.clarifyTask({ title: 'x' }, { signal: controller.signal })).rejects.toThrow();
    });
});
