import fs from 'fs/promises';
import path from 'path';
import type { Metadata } from 'next';
import matter from 'gray-matter';
import { Marked } from 'marked';
import hljs from 'highlight.js';
import Link from 'next/link';

interface NotePageProps {
  params: {
    slug: string;
  };
}

const notesDirectory = path.join(process.cwd(), 'content/notes');

const marked = new Marked();
marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      const highlighted = hljs.highlight(text, { language }).value;
      const langClass = lang ? ` language-${lang}` : '';
      return `<pre><code class="hljs${langClass}">${highlighted}</code></pre>\n`;
    },
  },
});

async function getNote(slug: string): Promise<{ date: string; html: string } | null> {
  try {
    const fileContents = await fs.readFile(path.join(notesDirectory, `${slug}.md`), 'utf8');
    const { data, content } = matter(fileContents);
    return {
      date: data.date || '',
      html: await marked.parse(content),
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: NotePageProps): Promise<Metadata> {
  const note = await getNote(params.slug);
  if (!note) return { title: '短记未找到' };
  return { title: '短记' };
}

export async function generateStaticParams() {
  try {
    const filenames = await fs.readdir(notesDirectory);
    return filenames
      .filter((filename) => filename.endsWith('.md'))
      .map((filename) => ({ slug: filename.replace(/\.md$/, '') }));
  } catch {
    return [];
  }
}

export default async function NotePage({ params }: NotePageProps) {
  const note = await getNote(params.slug);

  if (!note) {
    return <div className="page-shell empty-state">短记未找到。</div>;
  }

  return (
    <div className="page-shell article-shell">
      <div className="article-layout">
        <article className="article-main">
          <header className="article-header">
            <Link href="/" className="text-link" aria-label="返回首页">
              ← 返回首页
            </Link>
            <h1>短记</h1>
            <div className="article-meta">
              {note.date && (
                <time dateTime={note.date}>
                  {new Date(note.date).toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
              )}
            </div>
          </header>

          <div className="article-prose" dangerouslySetInnerHTML={{ __html: note.html }} />
        </article>
      </div>
    </div>
  );
}
