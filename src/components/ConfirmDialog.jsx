import React, { useState, useEffect, useRef } from "react";
import "./ConfirmDialog.css";

let confirmListeners = [];

export const showConfirm = (title, message, onConfirm, onCancel = null) => {
  return new Promise((resolve) => {
    const handleConfirm = async () => {
      try {
        if (onConfirm) await onConfirm();
        resolve(true);
      } catch (err) {
        console.error("Confirm action failed:", err);
        resolve(false);
      }
    };

    const handleCancel = () => {
      if (onCancel) onCancel();
      resolve(false);
    };

    confirmListeners.forEach(listener =>
      listener({ title, message, onConfirm: handleConfirm, onCancel: handleCancel, isOpen: true })
    );
  });
};

export default function ConfirmDialog() {
  const [dialog, setDialog] = useState({ isOpen: false, title: "", message: "", onConfirm: null, onCancel: null });
  const cancelButtonRef = useRef(null);
  const dialogIsOpen = dialog.isOpen;
  const dialogOnCancel = dialog.onCancel;

  useEffect(() => {
    confirmListeners.push(setDialog);
    return () => {
      confirmListeners = confirmListeners.filter(l => l !== setDialog);
    };
  }, []);

  useEffect(() => {
    if (!dialogIsOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => cancelButtonRef.current?.focus());

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      dialogOnCancel?.();
      setDialog({ isOpen: false, title: "", message: "", onConfirm: null, onCancel: null });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dialogIsOpen, dialogOnCancel]);

  if (!dialog.isOpen) return null;

  const handleClose = () => {
    dialog.onCancel?.();
    setDialog({ isOpen: false, title: "", message: "", onConfirm: null, onCancel: null });
  };

  const handleConfirm = () => {
    dialog.onConfirm?.();
    setDialog({ isOpen: false, title: "", message: "", onConfirm: null, onCancel: null });
  };

  return (
    <div className="confirm-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) handleClose(); }}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
        <div className="confirm-header">
          <h2 id="confirm-dialog-title">{dialog.title}</h2>
          <button type="button" className="confirm-close" onClick={handleClose} aria-label="Close confirmation">×</button>
        </div>
        <div className="confirm-body">
          <p id="confirm-dialog-message">{dialog.message}</p>
        </div>
        <div className="confirm-footer">
          <button type="button" ref={cancelButtonRef} className="btn-cancel" onClick={handleClose}>Cancel</button>
          <button type="button" className="btn-confirm" onClick={handleConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
