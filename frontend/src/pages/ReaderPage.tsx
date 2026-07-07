import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createBookProgressStreamUrl, fetchBookDetails, fetchChapter } from '../api';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';

const ReaderPage = () => {
  const { bookId } = useParams<{ bookId: string }>();
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const queryClient = useQueryClient();

  const { data: book, isLoading: isBookLoading } = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => fetchBookDetails(bookId!),
    enabled: !!bookId,
  });

  const currentChapterMeta = book?.chapters?.[currentChapterIdx];

  const { data: chapterDetail } = useQuery({
    queryKey: ['chapter', currentChapterMeta?.id],
    queryFn: () => fetchChapter(currentChapterMeta!.id),
    enabled: !!currentChapterMeta?.id,
  });

  useEffect(() => {
    if (!bookId) return;

    const stream = new EventSource(createBookProgressStreamUrl(bookId));
    stream.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ['book', bookId] });
      if (currentChapterMeta?.id) {
        queryClient.invalidateQueries({ queryKey: ['chapter', currentChapterMeta.id] });
      }
    };
    stream.onerror = () => {
      stream.close();
    };

    return () => {
      stream.close();
    };
  }, [bookId, currentChapterMeta?.id, queryClient]);

  if (isBookLoading) {
    return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Loading book...</div>;
  }

  if (!book) {
    return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Book not found.</div>;
  }

  if (!book.chapters || book.chapters.length === 0) {
    return <div style={{ textAlign: 'center', marginTop: '4rem' }}>No chapters available.</div>;
  }

  const currentChapter = chapterDetail || currentChapterMeta!;

  const goNext = () => {
    if (book.chapters && currentChapterIdx < book.chapters.length - 1) {
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
          {currentChapter.titleTranslated || currentChapter.titleOriginal}
        </h3>

        <div className="reader-content">
          {currentChapter.status === 'done' ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {currentChapter.translatedContent || 'Nội dung đã được dịch.'}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '4rem 0' }}>
              <div className="progress-bar-container" style={{ maxWidth: '300px', margin: '0 auto 1rem' }}>
                <div className="progress-bar" style={{ width: `${((currentChapter.completedSegments || 0) / (currentChapter.totalSegments || 1)) * 100}%` }}></div>
              </div>
              <p>Đang dịch ({currentChapter.completedSegments || 0}/{currentChapter.totalSegments || 0})...</p>
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
