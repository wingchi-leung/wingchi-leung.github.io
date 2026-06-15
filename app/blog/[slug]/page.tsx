import fs from 'fs/promises';
import path from 'path';
import type { Metadata } from 'next';
import matter from 'gray-matter';
import { Marked } from 'marked';
import hljs from 'highlight.js';
import { cn } from '@/lib/utils';
import { BlogTableOfContents } from '@/components/BlogTableOfContents';
import { BlogTocSidebar } from '@/components/BlogTocSidebar';

// 与 BlogTocSidebar 展开宽度一致，供服务端布局预留右侧空间（不从未标记 'use client' 的模块导入）
const BLOG_TOC_RESERVED_WIDTH_PX = 240 + 24;


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
    return <div>Blog post not found</div>;
  }

  return (
    <div className="relative px-4 md:px-8 lg:px-16">
      {/* 右侧固定目录（大屏显示） */}
      {post.toc.length > 0 && (
        <BlogTocSidebar items={post.toc} />
      )}

      {/* 正文区域：有目录时右侧留出空间，避免被遮挡 */}
      <main
        className={cn(
          'mx-auto my-8 max-w-screen-lg',
          post.toc.length > 0 && 'lg:mr-[var(--blog-toc-width)]'
        )}
        style={
          post.toc.length > 0
            ? { ['--blog-toc-width' as string]: `${BLOG_TOC_RESERVED_WIDTH_PX}px` }
            : undefined
        }
      >
        <article>
          <h1 className="text-2xl md:text-4xl font-bold mb-2">{post.title}</h1>
          {/* 文章元信息：日期 + 标签 */}
          <div className="flex flex-wrap items-center gap-3 mb-6 text-sm text-gray-400">
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
              <div className="flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <a
                    key={tag}
                    href={`/tags/${encodeURIComponent(tag)}`}
                    className="inline-block text-xs px-2 py-0.5 rounded-full
                               bg-[rgb(130,115,98)]/10 text-[rgb(130,115,98)]
                               hover:bg-[rgb(130,115,98)]/20 hover:-translate-y-0.5
                               transition-all duration-200"
                  >
                    {tag}
                  </a>
                ))}
              </div>
            )}
          </div>
          {/* 小屏：标题下方内联可折叠目录 */}
          {post.toc.length > 0 && (
            <div className="mb-6 max-w-md lg:hidden">
              <BlogTableOfContents items={post.toc} />
            </div>
          )}
          <div
            className="prose prose-sm md:prose-base lg:prose-lg max-w-none
            prose-headings:font-bold prose-headings:scroll-mt-20
            prose-p:text-gray-800 
            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
            prose-img:rounded-lg prose-img:mx-auto prose-img:max-w-full prose-img:h-auto"
            dangerouslySetInnerHTML={{ __html: post.html }}
          />
          <div className="h-10" />
        </article>
      </main>
    </div>
  );
}