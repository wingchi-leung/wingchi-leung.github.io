"use client";

import { usePathname } from 'next/navigation';

export default function RotatingAvatar() {
  const pathname = usePathname();
  
  if (pathname !== '/') {
    return null;
  }

  return (
    <div className="avatar-container">
      <div className="avatar-glow"></div>
      <div className="avatar-wrapper">
        <img
          src="/bigjump.jpg"
          alt="Profile"
          className="avatar-image"
        />
        <div className="avatar-border"></div>
      </div>
      <div className="avatar-tooltip">
        <span className="tooltip-text">👋 你好，我是 Wingchi</span>
      </div>
    </div>
  );
}
