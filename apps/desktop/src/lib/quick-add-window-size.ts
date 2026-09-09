import { resolveQuickAddWindowDimensions } from '@mindwtr/core';
import type { AppSettings, QuickAddWindowSize } from '@mindwtr/core';

import { logInfo, logWarn } from './app-log';
import { isTauriRuntime } from './runtime';
import { reportError } from './report-error';

/**
 * Applies the configured quick-add popup size to the current window. Only the
 * standalone quick-add window calls this: the in-main-window modal sizes with
 * its parent instead. Re-centers after resizing so a larger preset stays on
 * screen where the native show path put it.
 */
export const applyQuickAddWindowSize = async (
    size: QuickAddWindowSize | undefined,
): Promise<void> => {
    if (!isTauriRuntime()) return;
    try {
        const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
        const dimensions = resolveQuickAddWindowDimensions(size);
        const current = getCurrentWindow();
        await current.setSize(new LogicalSize(dimensions.width, dimensions.height));
        await current.center();
        const actual = await current.innerSize().catch(() => null);
        void logInfo('Applied quick add window size', {
            scope: 'window',
            extra: {
                preset: size ?? 'default',
                requestedWidth: dimensions.width,
                requestedHeight: dimensions.height,
                actualWidth: actual?.width,
                actualHeight: actual?.height,
            },
        });
    } catch (error) {
        reportError('Failed to apply quick add window size', error);
        void logWarn('Failed to apply quick add window size', {
            scope: 'window',
            extra: { error: error instanceof Error ? error.message : String(error) },
        });
    }
};

/** Reads the size out of settings so callers pass one value, not the store. */
export const applyQuickAddWindowSizeFromSettings = (
    settings: AppSettings | undefined,
): Promise<void> => applyQuickAddWindowSize(settings?.window?.quickAddSize);
