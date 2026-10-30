import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export interface Note {
  slug: string;
  date: string;
  /** 纯文本正文（已去掉 Markdown 记号、图片、代码块） */
  text: string;
  /** 正文是否超过摘要长度，超过时可点击进入全文 */
  truncated: boolean;
}

const notesDirectory = path.join(process.cwd(), 'content/notes');
/** 摘要显示的字符数，超出部分在列表中收起 */
const EXCERPT_LENGTH = 200;

// 把 Markdown 正文压成一段纯文本，供侧栏摘要使用
function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ') // 代码块
    .replace(/!\[\[[^\]]*\]\]/g, ' ') // Obsidian 图片
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // Markdown 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接保留文字
    .replace(/<[^>]+>/g, ' ') // 内联 HTML
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // 标题记号
    .replace(/^\s{0,3}>\s?/gm, '') // 引用记号
    .replace(/^\s{0,3}[-*+]\s+/gm, '') // 无序列表记号
    .replace(/^\s{0,3}\d+\.\s+/gm, '') // 有序列表记号
    .replace(/^\s{0,3}([-*_])(\s*\1){2,}\s*$/gm, ' ') // 分隔线
    .replace(/[*_`~]/g, '') // 强调、行内代码记号
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(text: string): { text: string; truncated: boolean } {
  const chars = Array.from(text); // 按字符而非 UTF-16 单元截断，避免切坏表情符号
  if (chars.length <= EXCERPT_LENGTH) return { text, truncated: false };
  return { text: chars.slice(0, EXCERPT_LENGTH).join('').trimEnd(), truncated: true };
}

/** 读取 content/notes 下的短博文，按日期倒序；目录不存在时返回空数组 */
export async function getNotes(): Promise<Note[]> {
  let filenames: string[];
  try {
    filenames = await fs.readdir(notesDirectory);
  } catch {
    return [];
  }

  const notes = await Promise.all(
    filenames
      .filter((filename) => filename.endsWith('.md'))
      .map(async (filename) => {
        const fileContents = await fs.readFile(path.join(notesDirectory, filename), 'utf8');
        const { data, content } = matter(fileContents);
        const body = excerpt(toPlainText(content));
        return {
          slug: filename.replace(/\.md$/, ''),
          date: data.date ?? '',
          text: body.text,
          truncated: body.truncated,
        };
      })
  );

  return notes
    .filter((note) => note.text.length > 0)
    .sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });
}

export function formatNoteDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
