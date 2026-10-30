export type TocItem = { level: number; text: string; id: string };

export function BlogTableOfContents({ items }: { items: TocItem[] }) {
  if (items.length === 0) return null;

  return (
    <details className="mobile-toc" open>
      <summary>本页目录</summary>
      <nav aria-label="文章目录">
        <ol>
          {items.map((item) => (
            <li key={item.id} data-level={item.level}>
              <a href={`#${item.id}`}>{item.text}</a>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  );
}
