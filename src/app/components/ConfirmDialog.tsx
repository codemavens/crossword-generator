import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { confirmsAction, isBackdropClick } from "../confirmations.ts";
import type { ConfirmRequest, DialogEvent } from "../confirmations.ts";

export type Confirm = (request: ConfirmRequest) => Promise<boolean>;

interface Pending extends ConfirmRequest {
  resolve: (ok: boolean) => void;
  opener: Element | null;
}

// One styled confirmation at a time, shown with the native modal <dialog> (focus trap, Escape, inert page).
export function useConfirm(): [Confirm, ReactNode, () => void] {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<Confirm>(
    (request) =>
      new Promise<boolean>((resolve) => {
        setPending((prev) => {
          prev?.resolve(false);
          return { ...request, resolve, opener: document.activeElement };
        });
      }),
    [],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!pending || !dialog) return;
    if (!dialog.open) dialog.showModal();
    cancelRef.current?.focus();
  }, [pending]);

  const finish = (event: DialogEvent) => {
    if (!pending) return;
    pendingRef.current = null;
    const { resolve, opener } = pending;
    setPending(null);
    dialogRef.current?.close();
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    resolve(confirmsAction(event));
  };

  const element = (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby="confirm-question"
      onCancel={(e) => {
        e.preventDefault();
        finish("escape");
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (isBackdropClick(r, e.clientX, e.clientY)) finish("backdrop");
      }}
    >
      {pending && (
        <div className="confirm-body">
          <div className="confirm-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l9.5 17h-19z" />
              <path d="M12 10v4.5M12 17.5v.01" />
            </svg>
          </div>
          <p id="confirm-question">{pending.question}</p>
          <div className="confirm-actions">
            <button type="button" ref={cancelRef} onClick={() => finish("cancel")}>
              Cancel
            </button>
            <button type="button" className="destructive" onClick={() => finish("confirm")}>
              {pending.confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
  // Closes without acting, e.g. when the item being confirmed no longer exists.
  const cancel = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    setPending(null);
    dialogRef.current?.close();
    if (p.opener instanceof HTMLElement && p.opener.isConnected) p.opener.focus();
    p.resolve(false);
  }, []);

  return [confirm, element, cancel];
}
