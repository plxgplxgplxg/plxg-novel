import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAppStore } from '../store';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';

const ReaderPage = () => {
  const { bookId } = useParams<{ bookId: string }>();
  const book = useAppStore(state => state.books.find(b => b.id === bookId));
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);

  if (!book) {
    return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Book not found.</div>;
  }

  if (book.chapters.length === 0) {
    return <div style={{ textAlign: 'center', marginTop: '4rem' }}>No chapters available.</div>;
  }

  const currentChapter = book.chapters[currentChapterIdx];

  const goNext = () => {
    if (currentChapterIdx < book.chapters.length - 1) {
      setCurrentChapterIdx(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goPrev = () => {
    if (currentChapterIdx > 0) {
      setCurrentChapterIdx(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="reader-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
        <div>
          <Link to="/" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <ChevronLeft size={16} /> Back to Dashboard
          </Link>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{book.title}</h2>
        </div>
      </div>

      <div className="card" style={{ padding: '3rem' }}>
        <h3 style={{ textAlign: 'center', fontSize: '1.75rem', marginBottom: '2rem', color: 'var(--primary)' }}>
          {currentChapter.title_translated || currentChapter.title_original}
        </h3>

        <div className="reader-content">
          {currentChapter.status === 'done' ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {currentChapter.translated_content || 'Nội dung đã được dịch (giả lập)...'}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '4rem 0' }}>
              <div className="progress-bar-container" style={{ maxWidth: '300px', margin: '0 auto 1rem' }}>
                <div className="progress-bar" style={{ width: `${(currentChapter.completed_segments / currentChapter.total_segments) * 100}%` }}></div>
              </div>
              <p>Đang dịch ({currentChapter.completed_segments}/{currentChapter.total_segments})...</p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
          <button onClick={goPrev} disabled={currentChapterIdx === 0} className="btn btn-secondary">
            <ChevronLeft size={18} /> Chương trước
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
            <List size={18} /> {currentChapterIdx + 1} / {book.chapters.length}
          </div>

          <button onClick={goNext} disabled={currentChapterIdx === book.chapters.length - 1} className="btn btn-secondary">
            Chương tiếp <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReaderPage;
