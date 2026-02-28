'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { TocItem } from './BlogTableOfContents';

const SIDEBAR_WIDTH_EXPANDED = 240;
const SIDEBAR_WIDTH_COLLAPSED = 44;

function scrollToHeading(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function BlogTocSidebar({ items }: { items: TocItem[] }) {
  const [open, setOpen] = useState(true);

  if (items.length === 0) return null;

  return (
    <aside
      className="fixed right-0 top-20 z-40 hidden lg:block transition-[width] duration-200 ease-out"
      style={{
        width: open ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED,
      }}
    >
      <div
        className={cn(
          'flex h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-l-lg border border-l border-border/60 bg-background/95 shadow-sm backdrop-blur'
        )}
      >
        {/* 展开/收起按钮 */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex shrink-0 items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2.5 text-sm font-medium',
            'hover:bg-muted/60 transition-colors',
            !open && 'justify-center border-b-0'
          )}
          aria-expanded={open}
          aria-label={open ? '收起目录' : '展开目录'}
        >
          {open ? (
            <>
              <span>目录</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 rotate-180 transition-transform"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </>
          ) : (
            <span
              className="text-xs"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              目录
            </span>
          )}
        </button>

        {/* 目录列表 */}
        <nav
          className={cn(
            'min-w-0 flex-1 overflow-y-auto px-3 py-3',
            !open && 'invisible w-0 overflow-hidden p-0'
          )}
          aria-label="文章目录"
        >
          <ul className="space-y-1 text-sm">
            {items.map((item) => (
              <li
                key={item.id}
                className={cn(
                  item.level === 2 && 'pl-0 font-medium',
                  item.level === 3 && 'pl-3 text-muted-foreground'
                )}
              >
                <button
                  type="button"
                  onClick={() => scrollToHeading(item.id)}
                  className="w-full truncate text-left hover:text-primary hover:underline focus:outline-none focus:underline"
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}

