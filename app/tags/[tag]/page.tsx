import { Metadata } from 'next';
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

export async function generateStaticParams() {
  const blogs = await getBlogPosts();
  const tagSet = new Set<string>();
  for (const post of blogs) {
    for (const tag of post.tags) {
      tagSet.add(tag);
    }
  }
  return Array.from(tagSet).map((tag) => ({ tag }));
}

export async function generateMetadata({
  params,
}: {
  params: { tag: string };
}): Promise<Metadata> {
  return {
    title: `标签: ${params.tag}`,
  };
}

export default async function TagPage({
  params,
}: {
  params: { tag: string };
}) {
  const tag = params.tag;
  const allPosts = await getBlogPosts();
  const filteredPosts = allPosts.filter((post) => post.tags.includes(tag));

  return (
    <div className="min-h-screen px-4 md:px-8 lg:px-16 max-w-screen-xl mx-auto">
      <section className="mb-20">
        <div className="mb-8">
          <a
            href="/"
            className="text-sm text-[rgb(130,115,98)] hover:underline"
          >
            ← 返回首页
          </a>
          <h1 className="text-2xl md:text-3xl font-bold mt-2 flex items-center gap-2">
            标签: <span className="text-[rgb(130,115,98)]">{tag}</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            共 {filteredPosts.length} 篇文章
          </p>
        </div>

        <div className="divide-y divide-gray-200">
          {filteredPosts.map((post) => (
            <a
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block group py-5 md:py-6 transition-colors duration-200 hover:bg-[rgb(245,243,238)] -mx-4 md:-mx-8 lg:-mx-16 px-4 md:px-8 lg:px-16"
            >
              <div className="flex flex-wrap items-baseline gap-3 mb-1.5">
                {post.date && (
                  <time
                    dateTime={post.date}
                    className="text-xs md:text-sm text-gray-400 shrink-0 group-hover:text-[rgb(130,115,98)] transition-colors duration-200"
                  >
                    {new Date(post.date).toLocaleDateString('zh-CN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </time>
                )}
                <h2 className="text-base md:text-lg font-semibold text-gray-800 group-hover:text-[rgb(130,115,98)] transition-colors duration-200">
                  {post.title}
                </h2>
              </div>
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {post.tags.map((t) => (
                    <span
                      key={t}
                      className={`inline-block text-xs px-2 py-0.5 rounded-full transition-all duration-200 ${
                        t === tag
                          ? 'bg-[rgb(130,115,98)] text-white'
                          : 'bg-[rgb(130,115,98)]/10 text-[rgb(130,115,98)]'
                      }`}
                    >
                      {t}
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

        {filteredPosts.length === 0 && (
          <p className="text-center text-gray-400 py-12">
            该标签下暂无文章
          </p>
        )}
      </section>
    </div>
  );
}
