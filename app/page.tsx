import Link from 'next/link';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { NoteSidebar } from '@/components/NoteSidebar';
import { getNotes } from '@/lib/notes';

interface BlogPost {
  slug: string;
  title: string;
  date: string;
  tags: string[];
}

interface BlogMonth {
  key: string;
  label: string;
  posts: BlogPost[];
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

function aggregateTags(blogs: BlogPost[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  blogs.forEach((post) => post.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
  return Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function groupPostsByMonth(blogs: BlogPost[]): BlogMonth[] {
  const groups = new Map<string, BlogMonth>();

  blogs.forEach((post) => {
    if (!post.date) {
      const undated = groups.get('undated') ?? { key: 'undated', label: '未注明日期', posts: [] };
      undated.posts.push(post);
      groups.set('undated', undated);
      return;
    }

    const date = new Date(post.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const month = groups.get(key) ?? {
      key,
      label: date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }),
      posts: [],
    };
    month.posts.push(post);
    groups.set(key, month);
  });

  return Array.from(groups.values());
}

export default async function Home() {
  const [blogs, notes] = await Promise.all([getBlogPosts(), getNotes()]);
  const tags = aggregateTags(blogs);
  const blogMonths = groupPostsByMonth(blogs);

  return (
    <div className={`page-shell home-page${notes.length > 0 ? ' home-page-with-notes' : ''}`}>
      <div className="home-layout">
        <div className="home-main">
          <section className="post-index-section" aria-labelledby="article-index-title">
            <div className="index-heading">
              <h2 id="article-index-title">文章</h2>
              <span>{blogs.length} 篇</span>
            </div>
            <div className="post-months">
              {blogMonths.map((month) => (
                <section className="post-month-group" key={month.key} aria-labelledby={`month-${month.key}`}>
                  <div className="post-month-heading">
                    <h3 id={`month-${month.key}`}>{month.label}</h3>
                    <span>{month.posts.length} 篇</span>
                  </div>
                  <ol className="post-index">
                    {month.posts.map((post) => (
                      <li key={post.slug}>
                        <Link className="post-row" href={`/blog/${post.slug}`}>
                          <time dateTime={post.date}>{post.date ? formatDate(post.date) : '未注明日期'}</time>
                          <span className="post-row-title">{post.title}</span>
                          <span className="post-row-tags" aria-label={post.tags.length ? `标签：${post.tags.join('、')}` : '无标签'}>
                            {post.tags.slice(0, 2).join(' / ') || '随笔'}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </section>

          {tags.length > 0 && (
            <nav className="tag-index" aria-label="按标签浏览">
              <span>按标签浏览</span>
              <div>
                {tags.map(({ name, count }) => (
                  <Link key={name} href={`/tags/${encodeURIComponent(name)}`}>
                    {name} <span>{count}</span>
                  </Link>
                ))}
              </div>
            </nav>
          )}
        </div>

        <NoteSidebar notes={notes} />
      </div>
    </div>
  );
}
