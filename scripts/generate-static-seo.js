/**
 * 构建时生成静态 SEO 文件，不依赖运行时执行代码。
 * 输出：public/sitemap.xml, public/robots.txt, public/llms.txt
 * 新增文章后重新 npm run build 会自动更新；GitHub Actions 会设置 NEXT_PUBLIC_SITE_URL；本地/Netlify 可手动设置以替换占位 URL。
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || 'https://your-username.github.io';
const siteName = '路边广播';
const siteDescription = '个人博客，记录与分享';

const contentDir = path.join(process.cwd(), 'content', 'blogs');
const publicDir = path.join(process.cwd(), 'public');

function getPosts() {
  if (!fs.existsSync(contentDir)) return [];
  const files = fs.readdirSync(contentDir).filter((f) => f.endsWith('.md'));
  return files.map((filename) => {
    const filePath = path.join(contentDir, filename);
    const raw = fs.readFileSync(filePath, 'utf8');
    const { data } = matter(raw);
    return {
      slug: filename.replace(/\.md$/, ''),
      title: data.title || '文章',
      date: data.date || new Date().toISOString(),
    };
  });
}

// 确保 public 存在
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const posts = getPosts();

// ----- sitemap.xml -----
const sitemapUrls = [
  { url: baseUrl, lastmod: new Date().toISOString().slice(0, 10), priority: '1.0', changefreq: 'weekly' },
  ...posts.map((p) => ({
    url: `${baseUrl}/blog/${p.slug}`,
    lastmod: (p.date && new Date(p.date).toISOString().slice(0, 10)) || new Date().toISOString().slice(0, 10),
    priority: '0.8',
    changefreq: 'weekly',
  })),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls
  .map(
    (u) => `  <url>
    <loc>${escapeXml(u.url)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap, 'utf8');
console.log('Generated public/sitemap.xml');

// ----- robots.txt -----
const robots = `User-Agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;
fs.writeFileSync(path.join(publicDir, 'robots.txt'), robots, 'utf8');
console.log('Generated public/robots.txt');

// ----- llms.txt (GEO / LLM 发现) -----
const llmsLines = [
  `# ${siteName}`,
  '',
  `> ${siteDescription}`,
  '',
  '## 博客',
  ...posts.map((p) => `- [${p.title}](${baseUrl}/blog/${p.slug}): ${p.title}`),
  '',
  '## Optional',
  `- [首页](${baseUrl}): 博客列表`,
];
const llmsTxt = llmsLines.join('\n');
fs.writeFileSync(path.join(publicDir, 'llms.txt'), llmsTxt, 'utf8');
console.log('Generated public/llms.txt');
