import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useListCopilot } from './useListCopilot';

const predictMetadata = vi.hoisted(() => vi.fn());

vi.mock('@mindwtr/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mindwtr/core')>();
    return { ...actual, createAIProvider: () => ({ predictMetadata }) };
});

const buildCopilotConfigMock = vi.hoisted(() => vi.fn(async (_settings: unknown, _apiKey: string, _sessionId?: string) => ({})));

vi.mock('../../../lib/ai-config', () => ({
    buildCopilotConfig: buildCopilotConfigMock,
    isAIKeyRequired: () => false,
    loadAIKey: vi.fn(async () => 'test-key'),
}));

const settings = { ai: { enabled: true, provider: 'openai' } } as never;

const renderListCopilot = () => renderHook(() => useListCopilot({
    settings,
    newTaskTitle: 'Book the dentist',
    allContexts: ['@phone'],
    allTags: ['#health'],
}));

/** The debounced copilot request plus the promise it awaits. */
const settleSuggestion = async () => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(900);
    });
};

describe('useListCopilot suggestion parts', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        predictMetadata.mockReset();
        predictMetadata.mockResolvedValue({ context: '@phone', tags: ['#health', '#errand'] });
    });

    it('applies exactly one part per chip and leaves the others suggestible (#1022)', async () => {
        const { result } = renderListCopilot();
        await settleSuggestion();

        expect(result.current.pendingCopilotParts).toEqual([
            { kind: 'context', value: '@phone' },
            { kind: 'tag', value: '#health' },
            { kind: 'tag', value: '#errand' },
        ]);

        act(() => {
            result.current.applyCopilotPart({ kind: 'tag', value: '#health' });
        });

        expect(result.current.copilotTags).toEqual(['#health']);
        expect(result.current.copilotContext).toBeNull();
        expect(result.current.pendingCopilotParts).toEqual([
            { kind: 'context', value: '@phone' },
            { kind: 'tag', value: '#errand' },
        ]);
    });

    it('reuses one OpenCode Go session per capture input and rotates after clear', async () => {
        const opencodeSettings = { ai: { enabled: true, provider: 'opencode-go' } } as never;
        const hook = renderHook(
            ({ title }: { title: string }) => useListCopilot({
                settings: opencodeSettings,
                newTaskTitle: title,
                allContexts: ['@phone'],
                allTags: ['#health'],
            }),
            { initialProps: { title: 'Book the dentist' } },
        );
        await settleSuggestion();
        const firstSession = buildCopilotConfigMock.mock.calls[buildCopilotConfigMock.mock.calls.length - 1]?.[2];
        expect(typeof firstSession).toBe('string');
        expect(String(firstSession ?? '')).not.toBe('');

        hook.rerender({ title: 'Book the dentist for Friday' });
        await settleSuggestion();
        expect(buildCopilotConfigMock.mock.calls[buildCopilotConfigMock.mock.calls.length - 1]?.[2]).toBe(firstSession);

        hook.rerender({ title: '' });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(100);
        });
        hook.rerender({ title: 'Book the optician' });
        await settleSuggestion();
        const rotated = buildCopilotConfigMock.mock.calls[buildCopilotConfigMock.mock.calls.length - 1]?.[2];
        expect(typeof rotated).toBe('string');
        expect(String(rotated ?? '')).not.toBe('');
        expect(rotated).not.toBe(firstSession);
    });

    it('applies only the remaining parts on apply-all', async () => {
        const { result } = renderListCopilot();
        await settleSuggestion();

        act(() => {
            result.current.applyCopilotPart({ kind: 'context', value: '@phone' });
        });
        act(() => {
            result.current.applyCopilotSuggestion();
        });

        expect(result.current.copilotContext).toBe('@phone');
        expect(result.current.copilotTags).toEqual(['#health', '#errand']);
        expect(result.current.pendingCopilotParts).toEqual([]);
    });
});
