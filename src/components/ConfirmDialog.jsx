import React, { useState, useEffect } from "react";
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

  useEffect(() => {
    confirmListeners.push(setDialog);
    return () => {
      confirmListeners = confirmListeners.filter(l => l !== setDialog);
    };
  }, []);

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
    <div className="confirm-overlay">
      <div className="confirm-dialog">
        <div className="confirm-header">
          <h2>{dialog.title}</h2>
          <button className="confirm-close" onClick={handleClose}>×</button>
        </div>
        <div className="confirm-body">
          <p>{dialog.message}</p>
        </div>
        <div className="confirm-footer">
          <button className="btn-cancel" onClick={handleClose}>Cancel</button>
          <button className="btn-confirm" onClick={handleConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
