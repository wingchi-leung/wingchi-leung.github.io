import fs from 'fs/promises';
import path from 'path';
import type { Metadata } from 'next';
import matter from 'gray-matter';
import { Marked } from 'marked';
import hljs from 'highlight.js';

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

async function getBlogPost(slug: string): Promise<{ title: string; html: string } | null> {
  const filePath = path.join(blogsDirectory, `${slug}.md`);
  try {
    const fileContents = await fs.readFile(filePath, 'utf8');
    const { data, content } = matter(fileContents);
    const normalizedContent = normalizeMarkdownImages(content);
    let html = await marked.parse(normalizedContent);
    html = rewriteAssetPaths(html);
    return {
      title: data.title || 'No Title',
      html,
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
    <div className="px-4 md:px-8 lg:px-16 max-w-screen-lg mx-auto">
      <article className="my-8">
        <h1 className="text-2xl md:text-4xl font-bold mb-6">{post.title}</h1>
        <div 
          className="prose prose-sm md:prose-base lg:prose-lg max-w-none
          prose-headings:font-bold
          prose-p:text-gray-800 
          prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
          prose-img:rounded-lg prose-img:mx-auto prose-img:max-w-full prose-img:h-auto"
          dangerouslySetInnerHTML={{ __html: post.html }} 
        />
        <div className="h-10"></div>
      </article>
     </div>
  );
}