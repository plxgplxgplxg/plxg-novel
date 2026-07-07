import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createBookProgressStreamUrl, fetchBookDetails, fetchChapter } from '../api';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';

const ReaderPage = () => {
  const { bookId, chapterId } = useParams<{ bookId: string; chapterId: string }>();
  const queryClient = useQueryClient();

  const { data: book, isLoading: isBookLoading } = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => fetchBookDetails(bookId!),
    enabled: !!bookId,
  });

  const currentChapterIdx = book?.chapters.findIndex((chapter) => chapter.id === chapterId) ?? -1;
  const currentChapterMeta = currentChapterIdx >= 0 ? book?.chapters?.[currentChapterIdx] : undefined;

  const { data: chapterDetail } = useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: () => fetchChapter(chapterId!),
    enabled: !!chapterId,
  });

  useEffect(() => {
    if (!bookId) return;

    const stream = new EventSource(createBookProgressStreamUrl(bookId));
    stream.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ['book', bookId] });
      if (chapterId) {
        queryClient.invalidateQueries({ queryKey: ['chapter', chapterId] });
      }
    };
    stream.onerror = () => {
      stream.close();
    };

    return () => {
      stream.close();
    };
  }, [bookId, chapterId, queryClient]);

  if (isBookLoading) {
    return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Loading book...</div>;
  }

  if (!book) {
    return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Book not found.</div>;
  }

  if (!book.chapters || book.chapters.length === 0) {
    return <div style={{ textAlign: 'center', marginTop: '4rem' }}>No chapters available.</div>;
  }

  const currentChapter = chapterDetail;
  const prevChapter = currentChapterIdx > 0 ? book.chapters[currentChapterIdx - 1] : undefined;
  const nextChapter = currentChapterIdx >= 0 && currentChapterIdx < book.chapters.length - 1 ? book.chapters[currentChapterIdx + 1] : undefined;

  if (!currentChapterMeta || !currentChapter) {
    return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Chapter not found or not ready.</div>;
  }

  return (
    <div className="reader-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
        <div>
          <Link to="/" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <ChevronLeft size={16} /> Trang chủ
          </Link>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{book.title}</h2>
        </div>
      </div>

      <div className="card" style={{ padding: '3rem' }}>
        <h3 style={{ textAlign: 'center', fontSize: '1.75rem', marginBottom: '2rem', color: 'var(--primary)' }}>
          {currentChapter.titleTranslated || currentChapter.titleOriginal}
        </h3>

        <div className="reader-content">
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {currentChapter.translatedContent || 'Nội dung trống.'}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
          {prevChapter?.status === 'done' ? (
            <Link to={`/books/${book.id}/chapters/${prevChapter.id}`} className="btn btn-secondary">
              <ChevronLeft size={18} /> Chương trước
            </Link>
          ) : (
            <button disabled className="btn btn-secondary">
              <ChevronLeft size={18} /> Chương trước
            </button>
          )}
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
            <List size={18} /> {currentChapterIdx + 1} / {book.chapters.length}
          </div>

          {nextChapter?.status === 'done' ? (
            <Link to={`/books/${book.id}/chapters/${nextChapter.id}`} className="btn btn-secondary">
              Chương tiếp <ChevronRight size={18} />
            </Link>
          ) : (
            <button disabled className="btn btn-secondary">
              Chương tiếp <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReaderPage;
