import type { Metadata } from 'next';
import Link from 'next/link';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

interface BlogPost {
  slug: string;
  title: string;
  date: string;
  tags: string[];
}

async function getBlogPosts(): Promise<BlogPost[]> {
  const blogsDirectory = path.join(process.cwd(), 'content/blogs');
  const filenames = await fs.readdir(blogsDirectory);
  const blogs = await Promise.all(
    filenames.map(async (filename) => {
      const fileContents = await fs.readFile(path.join(blogsDirectory, filename), 'utf8');
      const { data } = matter(fileContents);
      return {
        title: data.title,
        slug: filename.replace(/\.md$/, ''),
        date: data.date ?? '',
        tags: data.tags || [],
      };
    })
  );
  return blogs.sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export async function generateStaticParams() {
  const blogs = await getBlogPosts();
  const tags = new Set<string>();
  blogs.forEach((post) => post.tags.forEach((tag) => tags.add(tag)));
  return Array.from(tags).map((tag) => ({ tag }));
}

export async function generateMetadata({ params }: { params: { tag: string } }): Promise<Metadata> {
  return { title: `标签: ${params.tag}` };
}

export default async function TagPage({ params }: { params: { tag: string } }) {
  const tag = params.tag;
  const posts = (await getBlogPosts()).filter((post) => post.tags.includes(tag));

  return (
    <div className="page-shell tag-page">
      <header className="tag-page-heading">
        <Link href="/" className="text-link">文章索引</Link>
        <div>
          <h1>{tag}</h1>
          <p>{posts.length} 篇文章</p>
        </div>
      </header>

      {posts.length > 0 ? (
        <ol className="post-index">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link className="post-row" href={`/blog/${post.slug}`}>
                <time dateTime={post.date}>{post.date ? formatDate(post.date) : '未注明日期'}</time>
                <span className="post-row-title">{post.title}</span>
                <span className="post-row-tags">{post.tags.slice(0, 2).join(' / ') || '随笔'}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-state">这个标签下还没有文章。</p>
      )}
    </div>
  );
}
