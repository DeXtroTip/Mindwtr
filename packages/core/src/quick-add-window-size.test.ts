import { describe, expect, it } from 'vitest';

import {
    QUICK_ADD_WINDOW_DIMENSIONS,
    normalizeQuickAddWindowSize,
    resolveQuickAddWindowDimensions,
} from './quick-add-window-size';

describe('normalizeQuickAddWindowSize', () => {
    it('keeps known presets', () => {
        expect(normalizeQuickAddWindowSize('compact')).toBe('compact');
        expect(normalizeQuickAddWindowSize('default')).toBe('default');
        expect(normalizeQuickAddWindowSize('large')).toBe('large');
    });

    it('falls back to default for unknown or missing values', () => {
        expect(normalizeQuickAddWindowSize(undefined)).toBe('default');
        expect(normalizeQuickAddWindowSize('huge')).toBe('default');
        expect(normalizeQuickAddWindowSize(42)).toBe('default');
    });
});

describe('resolveQuickAddWindowDimensions', () => {
    it('returns the legacy size for compact', () => {
        expect(resolveQuickAddWindowDimensions('compact')).toEqual({ width: 620, height: 420 });
    });

    it('returns a larger default with room for the autocomplete list', () => {
        const dimensions = resolveQuickAddWindowDimensions(undefined);
        expect(dimensions).toEqual(QUICK_ADD_WINDOW_DIMENSIONS.default);
        expect(dimensions.height).toBeGreaterThan(420);
    });

    it('normalizes before resolving', () => {
        expect(resolveQuickAddWindowDimensions('huge')).toEqual(QUICK_ADD_WINDOW_DIMENSIONS.default);
    });
});
