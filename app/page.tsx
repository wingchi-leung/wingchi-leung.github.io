import { Code } from 'lucide-react';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  tags: string[];
}

async function getBlogPosts(): Promise<BlogPost[]> {
  const blogsDirectory = path.join(process.cwd(), 'content/blogs');
  const filenames = await fs.readdir(blogsDirectory);

  const blogs = await Promise.all(
    filenames.map(async (filename) => {
      const filePath = path.join(blogsDirectory, filename);
      const fileContents = await fs.readFile(filePath, 'utf8');
      const { data } = matter(fileContents);

      return {
        title: data.title,
        excerpt: data.excerpt || '',
        slug: filename.replace(/\.md$/, ''),
        date: data.date ?? '',
        tags: data.tags || [],
      };
    })
  );

  blogs.sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });

  return blogs;
}

function aggregateTags(blogs: BlogPost[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const post of blogs) {
    for (const tag of post.tags) {
      map.set(tag, (map.get(tag) || 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export default async function Home() {
  const blogs = await getBlogPosts();
  const tags = aggregateTags(blogs);

  return (
    <div className="min-h-screen px-4 md:px-8 lg:px-16 max-w-screen-xl mx-auto">
      <div className="lg:flex lg:gap-10">
        <section className="mb-20 lg:mb-0 lg:flex-1 min-w-0">
          <div className="divide-y divide-gray-200">
            {blogs && blogs.map((post) => (
              <a 
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="block group py-5 md:py-6 transition-colors duration-200 hover:bg-[rgb(245,243,238)] -mx-4 md:-mx-8 lg:-mx-0 px-4 md:px-8 lg:px-6 rounded-lg"
              >
                <div className="flex flex-wrap items-baseline gap-3 mb-1.5">
                  {post.date && (
                    <time
                      dateTime={post.date}
                      suppressHydrationWarning
                      className="text-xs md:text-sm text-gray-400 shrink-0 group-hover:text-[rgb(130,115,98)] transition-colors duration-200"
                    >
                      {new Date(post.date).toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </time>
                  )}
                  <h3 className="text-lg md:text-xl font-medium min-w-0 text-gray-800 group-hover:text-[rgb(130,115,98)] transition-colors duration-200">
                    {post.title}
                  </h3>
                </div>
                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block text-xs px-2 py-0.5 rounded-full bg-[rgb(130,115,98)]/10 text-[rgb(130,115,98)] transition-all duration-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {post.excerpt && (
                  <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
                    {post.excerpt}
                  </p>
                )}
              </a>
            ))}
          </div>
        </section>

        <aside className="hidden lg:block w-60 shrink-0">
          <div className="sticky top-24">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              标签
            </h2>
            <div className="flex flex-wrap gap-2">
              {tags.map(({ name, count }) => (
                <a
                  key={name}
                  href={`/tags/${encodeURIComponent(name)}`}
                  className="group inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-full bg-[rgb(130,115,98)]/5 text-[rgb(130,115,98)] hover:bg-[rgb(130,115,98)] hover:text-white transition-all duration-200"
                >
                  <span>{name}</span>
                  <span className="text-xs opacity-60 group-hover:opacity-80">{count}</span>
                </a>
              ))}
            </div>
            {tags.length === 0 && (
              <p className="text-sm text-gray-400">暂无标签</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
