import Link from 'next/link';
import { Github } from 'lucide-react';
import RotatingAvatar from './RotatingAvatar';

export default function Navigation() {
  return (
    <header className="site-header">
      <nav className="site-nav" aria-label="主导航">
        <div className="nav-identity">
          <RotatingAvatar />
          <Link href="/" className="brand-link" aria-label="路边广播首页">
            <span className="brand-wordmark">Wingchi</span>
            <span className="brand-line">Coding, writing and shipping</span>
          </Link>
        </div>
        <a
          className="github-link"
          href="https://github.com/wingchi-leung"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="在 GitHub 查看 Wingchi"
        >
          <Github aria-hidden="true" size={20} strokeWidth={1.8} />
          <span>GitHub</span>
        </a>
      </nav>
    </header>
  );
}
