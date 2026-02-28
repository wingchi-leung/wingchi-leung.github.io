'use client';

import { useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export type TocItem = { level: number; text: string; id: string };

function scrollToHeading(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function BlogTableOfContents({ items }: { items: TocItem[] }) {
  const [open, setOpen] = useState(true);

  if (items.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center justify-between rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-left text-sm font-medium',
          'hover:bg-muted/60 transition-colors [&[data-state=open]>svg]:rotate-180'
        )}
      >
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
          className="shrink-0 transition-transform duration-200"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <nav
          className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
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
                  className={cn(
                    'w-full text-left hover:text-primary hover:underline focus:outline-none focus:underline'
                  )}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </CollapsibleContent>
    </Collapsible>
  );
}
