'use client';

import { useEffect, useState } from 'react';
import type { TocItem } from './BlogTableOfContents';

export function BlogTocSidebar({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((heading): heading is HTMLElement => Boolean(heading));

    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-18% 0px -68% 0px', threshold: [0, 1] }
    );

    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <aside className="toc-sidebar" aria-label="文章目录">
      <div className="toc-sticky">
        <h2>本页目录</h2>
        <nav>
          <ol>
            {items.map((item) => (
              <li key={item.id} data-level={item.level}>
                <a href={`#${item.id}`} aria-current={activeId === item.id ? 'location' : undefined}>
                  {item.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </aside>
  );
}
