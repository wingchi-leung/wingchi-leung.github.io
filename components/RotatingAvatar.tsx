"use client";

import { usePathname } from 'next/navigation';

export default function RotatingAvatar() {
  const pathname = usePathname();
  
  if (pathname !== '/') {
    return null;
  }

  return (
    <img
      src="/bigjump.jpg"
      alt="Profile"
      className="fixed top-4 left-4 md:top-6 md:left-6 z-10"
      style={{
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        objectFit: 'cover',
        animation: 'rotate 30s linear infinite',
      }}
    />
  );
}
