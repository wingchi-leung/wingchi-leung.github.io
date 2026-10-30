import Link from 'next/link';
import { formatNoteDate, type Note } from '@/lib/notes';

export function NoteSidebar({ notes }: { notes: Note[] }) {
  if (notes.length === 0) return null;

  return (
    <aside className="note-sidebar" aria-labelledby="note-sidebar-title">
      <div className="index-heading">
        <h2 id="note-sidebar-title">短记</h2>
        <span>{notes.length} 条</span>
      </div>
      <ol className="note-list">
        {notes.map((note) => (
          <li key={note.slug}>
            <div className="note-entry">
              {note.date && <time dateTime={note.date}>{formatNoteDate(note.date)}</time>}
              <p className="note-text">{note.text}</p>
            </div>
            {note.truncated && (
              <Link className="note-more" href={`/notes/${note.slug}/`}>
                继续读 →
              </Link>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}
