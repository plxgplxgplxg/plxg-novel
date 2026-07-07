import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createBookProgressStreamUrl, fetchBookDetails } from '../api';
import { ChevronLeft, BookOpen, ListOrdered } from 'lucide-react';

const BookDetailPage = () => {
  const { bookId } = useParams<{ bookId: string }>();
  const queryClient = useQueryClient();

  const { data: book, isLoading } = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => fetchBookDetails(bookId!),
    enabled: !!bookId,
  });

  useEffect(() => {
    if (!bookId || !book || !['draft', 'processing'].includes(book.status)) {
      return;
    }

    const stream = new EventSource(createBookProgressStreamUrl(bookId));
    stream.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ['book', bookId] });
      queryClient.invalidateQueries({ queryKey: ['books'] });
    };
    stream.onerror = () => stream.close();

    return () => stream.close();
  }, [book, bookId, queryClient]);

  if (isLoading) {
    return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Loading book...</div>;
  }

  if (!book) {
    return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Book not found.</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to="/" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
          <ChevronLeft size={16} /> Trang chủ
        </Link>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ marginBottom: '0.25rem' }}>{book.title}</h2>
            <p style={{ color: 'var(--text-muted)' }}>{book.originalTitle}</p>
          </div>
          <span className={`badge badge-${book.status}`}>{book.status}</span>
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span>Tiến độ dịch</span>
            <span>
              {book.completedSegments}/{book.totalSegments} segment
            </span>
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{
                width: `${book.totalSegments === 0 ? 0 : Math.round((book.completedSegments / book.totalSegments) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <ListOrdered size={18} />
          <h3>Mục lục chương</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {book.chapters.map((chapter) => {
            const canRead = chapter.status === 'done';
            const chapterProgress = chapter.totalSegments === 0 ? 0 : Math.round((chapter.completedSegments / chapter.totalSegments) * 100);

            return (
              <div
                key={chapter.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.875rem 1rem',
                  background: 'rgba(15, 23, 42, 0.35)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    Chương {chapter.chapterNumber}: {chapter.titleTranslated || chapter.titleOriginal}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                    {chapter.completedSegments}/{chapter.totalSegments} segment · {chapter.status}
                  </div>
                </div>

                {canRead ? (
                  <Link to={`/books/${book.id}/chapters/${chapter.id}`} className="btn" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                    <BookOpen size={16} /> Đọc
                  </Link>
                ) : (
                  <div style={{ minWidth: '160px' }}>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ width: `${chapterProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BookDetailPage;
