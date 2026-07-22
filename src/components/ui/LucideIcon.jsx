import React from 'react';
import * as LucideIcons from 'lucide-react';

const ICON_MAP = {
  home: 'Home',
  gallery: 'Image',
  store: 'ShoppingBag',
  request: 'Plus',
  knives: 'Knife',
  account: 'User',
  business: 'Building2',
  admin: 'Shield',
  signout: 'LogOut',
  chevron: 'ChevronDown',
  menu: 'Menu'
};

export default function LucideIcon({ name, size = 20, strokeWidth = 1.8, className = 'nk-icon' }) {
  const iconKey = ICON_MAP[name] || name;
  const IconComponent = LucideIcons[iconKey];
  if (!IconComponent) {
    // Fallback: render nothing but avoid throwing
    // eslint-disable-next-line no-console
    console.warn(`Lucide icon not found: ${iconKey}`);
    return null;
  }

  return <IconComponent size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}
