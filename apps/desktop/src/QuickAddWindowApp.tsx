import { useEffect } from 'react';
import { useTaskStore } from '@mindwtr/core';

import { QuickAddModal } from './components/QuickAddModal';
import { applyQuickAddWindowSize } from './lib/quick-add-window-size';

export function QuickAddWindowApp() {
    // The native popup is created at a fixed default size; resize it to the
    // configured preset once settings load, and again on every change. The
    // effect also runs on mount so the default preset applies before first show.
    const quickAddSize = useTaskStore((state) => state.settings?.window?.quickAddSize);
    useEffect(() => {
        void applyQuickAddWindowSize(quickAddSize);
    }, [quickAddSize]);

    return (
        <div className="h-full bg-transparent text-foreground">
            <QuickAddModal standaloneWindow />
        </div>
    );
}
