import { Code } from 'lucide-react';
import fs from 'fs/promises'; // Import fs.promises for async file reading
import path from 'path';
import matter from 'gray-matter';
 

// Define the type for a blog post
interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date:string ; 

}

async function getBlogPosts(): Promise<BlogPost[]> {  // Create an async function to fetch blog posts
  const blogsDirectory = path.join(process.cwd(), 'content/blogs');
  const filenames = await fs.readdir(blogsDirectory); // Use await

  const blogs = await Promise.all( // Use Promise.all to await all file readings
    filenames.map(async (filename) => { // Mark the map function as async
      const filePath = path.join(blogsDirectory, filename);
      const fileContents = await fs.readFile(filePath, 'utf8'); // Use await
      const { data } = matter(fileContents);

      // 将 Markdown 转换为 HTML
      return {
        title: data.title,
        excerpt: data.excerpt || '',
        slug: filename.replace(/\.md$/, ''),
        date: data.date ?? '',

      };
    })
  );

    // 根据日期排序（降序），无日期的排到最后
    blogs.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

  return blogs;
}

 
export default async function Home() {
  const blogs = await getBlogPosts();

  return (
    <div className="min-h-screen px-4 md:px-8 lg:px-16 max-w-screen-xl mx-auto">
      <section className="mb-20">
        <div className="divide-y divide-gray-200">
          {blogs && blogs.map((post) => (
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
                <h3 className="text-lg md:text-xl font-medium min-w-0 text-gray-800 group-hover:text-[rgb(130,115,98)] transition-colors duration-200">
                  {post.title}
                </h3>
              </div>
              {post.excerpt && (
                <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
                  {post.excerpt}
                </p>
              )}
            </a>
          ))}
        </div>
      </section>

    
       {/* <section className="mb-20">
        <h2 className="text-2xl md:text-3xl mb-8 flex items-center gap-2">
          <Code className="w-6 h-6 md:w-8 md:h-8" style={{ color: 'rgb(99, 99, 99)' }} />
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <a href="https://pixel-earth.pages.dev/game" 
             className="block hover:transform hover:scale-105 transition-transform duration-200"
             target="_blank" 
             rel="noopener noreferrer"
          >
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="aspect-video relative">
                <Image
                  src="asset/pixel-earth.gif"
                  alt="Pixel Earth"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-4">
                <h3 className="text-lg md:text-xl font-semibold mb-2 text-gray-800">
                  Pixel Earth
                </h3>
                <p className="text-sm md:text-base text-gray-600">
                  用Blender+enable3d做了个地球
                </p>
              </div>
            </div>
          </a>
          
 
        </div> */}
      {/* </section>   */}
    </div>
  );
}