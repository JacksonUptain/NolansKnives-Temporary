import React, { useEffect, useState } from "react";
import "./Toast.css";

const toastStack = [];
let toastId = 0;
const toastListeners = [];

export const showToast = (message, type = "info", duration = 3000) => {
  const id = toastId++;
  const toast = { id, message, type };
  toastStack.push(toast);
  toastListeners.forEach(listener => listener([...toastStack]));

  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }
  return id;
};

export const removeToast = (id) => {
  const index = toastStack.findIndex(t => t.id === id);
  if (index > -1) {
    toastStack.splice(index, 1);
    toastListeners.forEach(listener => listener([...toastStack]));
  }
};

export default function Toast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    toastListeners.push(setToasts);
    return () => {
      toastListeners.splice(toastListeners.indexOf(setToasts), 1);
    };
  }, []);

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <p>{toast.message}</p>
          <button onClick={() => removeToast(toast.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
