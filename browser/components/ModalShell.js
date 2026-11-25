import { jsx as _jsx, jsxs as _jsxs } from '../../vendor/browser/jsx-runtime.js';
import { useEffect, useRef } from '../../vendor/browser/react.js';
import { X } from '../../vendor/browser/lucide-react.js';
export default function ModalShell({ title, onClose, children }) {
    const box = useRef(null);
    useEffect(() => {
        const previous = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        box.current?.focus();
        const key = (e) => {
            if (e.key === 'Escape')
                onClose();
            if (e.key !== 'Tab')
                return;
            const list = box.current?.querySelectorAll('button:not(:disabled),a[href],input,select,[tabindex="0"]');
            if (!list?.length)
                return;
            const first = list[0], last = list[list.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', key);
        return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', key); previous?.focus(); };
    }, [onClose]);
    return _jsx("div", { className: "modal-backdrop", onClick: e => { if (e.target === e.currentTarget)
            onClose(); }, children: _jsxs("div", { className: "modal", role: "dialog", "aria-modal": "true", "aria-label": title, tabIndex: -1, ref: box, children: [_jsx("button", { className: "modal-close icon-button", "aria-label": "Tutup", onClick: onClose, children: _jsx(X, { size: 21 }) }), children] }) });
}
