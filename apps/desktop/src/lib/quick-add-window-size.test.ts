import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyQuickAddWindowSize, applyQuickAddWindowSizeFromSettings } from './quick-add-window-size';

const setSize = vi.fn(async () => undefined);
const center = vi.fn(async () => undefined);
const logicalSizeCalls: Array<{ width: number; height: number }> = [];

vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({ setSize, center }),
    LogicalSize: class {
        width: number;
        height: number;
        constructor(width: number, height: number) {
            this.width = width;
            this.height = height;
            logicalSizeCalls.push({ width, height });
        }
    },
}));

vi.mock('./report-error', () => ({
    reportError: vi.fn(),
}));

describe('applyQuickAddWindowSize', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        logicalSizeCalls.length = 0;
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    });

    it('does nothing outside the Tauri runtime', async () => {
        await applyQuickAddWindowSize('large');

        expect(setSize).not.toHaveBeenCalled();
    });

    it('applies the large preset and recenters', async () => {
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};

        await applyQuickAddWindowSize('large');

        expect(logicalSizeCalls).toEqual([{ width: 760, height: 600 }]);
        expect(setSize).toHaveBeenCalledTimes(1);
        expect(center).toHaveBeenCalledTimes(1);
    });

    it('resolves the size from settings', async () => {
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};

        await applyQuickAddWindowSizeFromSettings({ window: { quickAddSize: 'compact' } });

        expect(logicalSizeCalls).toEqual([{ width: 620, height: 420 }]);
    });
});
