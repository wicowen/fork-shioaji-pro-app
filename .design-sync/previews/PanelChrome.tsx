import { PanelChrome } from 'shioaji-pro-app';

// the shared panel title bar — drag handle, optional symbol link/pin control,
// pop-out and remove buttons. Children render inline before the controls.
export function Default() {
    return (
        <div style={{ width: '300px' }}>
            <PanelChrome title="五檔力道" onRemove={() => {}} />
        </div>
    );
}

export function Linked() {
    return (
        <div style={{ width: '300px' }}>
            <PanelChrome
                title="報價"
                pinnable
                pin={null}
                currentCode="TXFR1"
                onPinChange={() => {}}
                onRemove={() => {}}
            />
        </div>
    );
}

export function Pinned() {
    return (
        <div style={{ width: '300px' }}>
            <PanelChrome
                title="報價"
                pinnable
                pin="TMFR1"
                onPinChange={() => {}}
                onPopout={() => {}}
                onRemove={() => {}}
            />
        </div>
    );
}
