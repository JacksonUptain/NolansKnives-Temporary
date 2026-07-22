import React from 'react';
import './ui.css';

export default function Card({ children, className = '', ...props }) {
  return (
    <div className={`nk-card ${className}`} {...props}>
      {children}
    </div>
  );
}
