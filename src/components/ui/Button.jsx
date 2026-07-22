import React from 'react';
import './ui.css';

export default function Button({ variant = 'primary', size = 'md', children, className = '', ...props }) {
  const cls = `nk-btn nk-btn-${variant} nk-btn-${size} ${className}`.trim();
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}
