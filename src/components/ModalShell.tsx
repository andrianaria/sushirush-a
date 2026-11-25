import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export default function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    box.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const list = box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,[tabindex="0"]');
      if (!list?.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={box}><button className="modal-close icon-button" aria-label="Tutup" onClick={onClose}><X size={21}/></button>{children}</div></div>;
}
