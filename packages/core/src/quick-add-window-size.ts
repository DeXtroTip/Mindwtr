import type { QuickAddWindowSize } from './types';

export const QUICK_ADD_WINDOW_SIZE_VALUES: readonly QuickAddWindowSize[] = [
    'compact',
    'default',
    'large',
];

export const QUICK_ADD_WINDOW_SIZE_VALUE_SET: ReadonlySet<QuickAddWindowSize> = new Set(
    QUICK_ADD_WINDOW_SIZE_VALUES,
);

/**
 * Native popup dimensions per size preset. Compact preserves the original
 * 620x420 window; default is the new out-of-the-box size with room for the
 * autocomplete list below the input.
 */
export const QUICK_ADD_WINDOW_DIMENSIONS: Record<
    QuickAddWindowSize,
    { width: number; height: number }
> = {
    compact: { width: 620, height: 420 },
    default: { width: 680, height: 540 },
    large: { width: 760, height: 600 },
};

/** Unknown or missing values fall back to the default preset. */
export const normalizeQuickAddWindowSize = (value: unknown): QuickAddWindowSize => (
    typeof value === 'string' && QUICK_ADD_WINDOW_SIZE_VALUE_SET.has(value as QuickAddWindowSize)
        ? (value as QuickAddWindowSize)
        : 'default'
);

/** Dimensions for a stored setting value, normalized first. */
export const resolveQuickAddWindowDimensions = (value: unknown): { width: number; height: number } => (
    QUICK_ADD_WINDOW_DIMENSIONS[normalizeQuickAddWindowSize(value)]
);
