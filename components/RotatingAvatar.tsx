'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function RotatingAvatar() {
  const pathname = usePathname();

  if (pathname !== '/') return null;

  return (
    <Link href="/" className="avatar-link" aria-label="返回路边广播首页">
      <Image src="/bigjump.jpg" alt="Wingchi" width={44} height={44} priority />
    </Link>
  );
}
