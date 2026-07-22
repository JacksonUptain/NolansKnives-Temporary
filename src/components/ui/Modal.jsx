import React from 'react';
import './ui.css';
import LucideIcon from './LucideIcon';

export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div className="nk-modal-overlay" onClick={onClose}>
      <div className="nk-modal" onClick={(e) => e.stopPropagation()}>
        <button className="nk-modal-close" onClick={onClose} aria-label="Close modal">
          <LucideIcon name="X" />
        </button>
        {title && <h2>{title}</h2>}
        <div className="nk-modal-body">{children}</div>
      </div>
    </div>
  );
}
