import React from 'react';
import './ui.css';

export default function Skeleton({ width = '100%', height = '1em', style = {} }) {
  return <div className="nk-skeleton" style={{ width, height, ...style }} />;
}
