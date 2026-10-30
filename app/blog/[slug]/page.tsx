import fs from 'fs/promises';
import path from 'path';
import type { Metadata } from 'next';
import matter from 'gray-matter';
import { Marked } from 'marked';
import hljs from 'highlight.js';
import Link from 'next/link';
import { BlogTableOfContents } from '@/components/BlogTableOfContents';
import { BlogTocSidebar } from '@/components/BlogTocSidebar';


interface BlogPostProps {
  params: {
    slug: string;
  };
}

const blogsDirectory = path.join(process.cwd(), 'content/blogs');

async function getBlogMeta(slug: string): Promise<{ title: string; description?: string } | null> {
  const filePath = path.join(blogsDirectory, `${slug}.md`);
  try {
    const fileContents = await fs.readFile(filePath, 'utf8');
    const { data } = matter(fileContents);
    return {
      title: data.title || 'No Title',
      description: data.description,
    };
  } catch {
    return null;
  }
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

// 将 Obsidian 语法 ![[文件名.png]] 转为标准 Markdown 图片，图床目录 /blog_asset
function normalizeMarkdownImages(content: string): string {
  return content.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, filename) => {
    const name = filename.trim();
    const src = name.startsWith('http')
      ? name
      : `${basePath}/blog_asset/${name.split('/').map(encodeURIComponent).join('/')}`;
    const alt = name.split('/').pop() || name;
    return `![${alt}](${src})`;
  });
}

// 为文章 HTML 中的 /blog_asset/ 路径加上 basePath（部署在 GitHub Pages 子路径时用）
function rewriteAssetPaths(html: string): string {
  if (!basePath) return html;
  return html.replace(/(\s)(src|href)="\/blog_asset\//g, `$1$2="${basePath}/blog_asset/`);
}

// 生成标题锚点 id（与 marked 渲染时一致）
function slugify(text: string): string {
  const s = text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return s || 'heading';
}

export type TocItem = { level: number; text: string; id: string };

// 从 Markdown 原文提取目录（仅 h2、h3）
function extractToc(content: string): TocItem[] {
  const lines = content.split('\n');
  const toc: TocItem[] = [];
  const idCount = new Map<string, number>();
  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.+)$/);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();
    let id = slugify(text);
    if (idCount.has(id)) {
      idCount.set(id, idCount.get(id)! + 1);
      id = `${id}-${idCount.get(id)}`;
    } else {
      idCount.set(id, 1);
    }
    toc.push({ level, text, id });
  }
  return toc;
}



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

async function getBlogPost(slug: string): Promise<{ title: string; date: string; tags: string[]; html: string; toc: TocItem[] } | null> {
  const filePath = path.join(blogsDirectory, `${slug}.md`);
  try {
    const fileContents = await fs.readFile(filePath, 'utf8');
    const { data, content } = matter(fileContents);
    const toc = extractToc(content);
    const normalizedContent = normalizeMarkdownImages(content);
    let html = await marked.parse(normalizedContent);
    // 按 TOC 顺序为正文中的 h2/h3 注入 id，与目录项一致
    let idx = 0;
    html = html.replace(/<h([23])>([^<]*)<\/h\1>/g, (_match, _level, innerText) => {
      const item = toc[idx];
      idx += 1;
      if (!item) return _match;
      return `<h${item.level} id="${item.id}">${innerText}</h${item.level}>`;
    });
    html = rewriteAssetPaths(html);
    return {
      title: data.title || 'No Title',
      date: data.date || '',
      tags: data.tags || [],
      html,
      toc,
    };
  } catch (error) {
    console.error(`Error reading or parsing blog post ${slug}:`, error);
    return null;
  }
}

export async function generateMetadata({ params }: BlogPostProps): Promise<Metadata> {
  const meta = await getBlogMeta(params.slug);
  if (!meta) return { title: '文章未找到' };
  return {
    title: meta.title,
    ...(meta.description && {
      description: meta.description,
      openGraph: { title: meta.title, description: meta.description },
    }),
  };
}

export async function generateStaticParams() {
  const filenames = await fs.readdir(blogsDirectory);

  return filenames.map(filename => ({
    slug: filename.replace(/\.md$/, ''),
  }));
}

export default async function BlogPost({ params }: BlogPostProps) {
  const { slug } = params;
  const post = await getBlogPost(slug);

  if (!post) {
    return <div className="page-shell empty-state">文章未找到。</div>;
  }

  return (
    <div className="page-shell article-shell">
      <div className={post.toc.length > 0 ? 'article-layout article-layout-with-toc' : 'article-layout'}>
        {post.toc.length > 0 && <BlogTocSidebar items={post.toc} />}

        <article className="article-main">
          <header className="article-header">
            <Link href="/" className="text-link" aria-label="返回文章列表">
              ← 返回文章列表
            </Link>
            <h1>{post.title}</h1>
            <div className="article-meta">
            {post.date && (
              <time dateTime={post.date}>
                {new Date(post.date).toLocaleDateString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            )}
            {post.tags && post.tags.length > 0 && (
              <div className="article-tags" aria-label="文章标签">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/tags/${encodeURIComponent(tag)}`}
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            )}
            </div>
          </header>

          {post.toc.length > 0 && (
            <div className="mobile-toc-wrap">
              <BlogTableOfContents items={post.toc} />
            </div>
          )}

          <div
            className="article-prose"
            dangerouslySetInnerHTML={{ __html: post.html }}
          />
        </article>
      </div>
    </div>
  );
}
