import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchBooks, startTranslation } from '../api';
import { Link } from 'react-router-dom';
import { Play, RotateCw, BookOpen, AlertCircle, Plus } from 'lucide-react';
import type { Book } from '../store'; // Just for types
import { useState } from 'react';

const DashboardPage = () => {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: books = [], isLoading } = useQuery({
    queryKey: ['books'],
    queryFn: fetchBooks,
    refetchInterval: 3000, // Poll every 3 seconds
  });

  const translateMutation = useMutation({
    mutationFn: startTranslation,
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['books'] });
    },
    onError: (error: any) => {
      setActionError(error?.response?.data?.message || 'Start translation failed.');
    },
  });

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: '4rem' }}>Loading...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Translation Dashboard</h2>
        <Link to="/upload" className="btn">
          Upload New Book
        </Link>
      </div>

      {books.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <BookOpen size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
          <h3>No books found</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Upload a Chinese novel to start translating.</p>
        </div>
      ) : (
        <>
          {actionError && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.875rem 1rem',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#f87171',
                fontSize: '0.875rem',
              }}
            >
              {actionError}
            </div>
          )}
          <div className="grid">
            {books.map((book: Book) => {
            const totalSegments = book.chapters?.reduce((acc, c) => acc + (c.totalSegments || 0), 0) || 0;
            const completedSegments = book.chapters?.reduce((acc, c) => acc + (c.completedSegments || 0), 0) || 0;
            const progress = totalSegments === 0 ? 0 : Math.round((completedSegments / totalSegments) * 100);
            const hasChapters = (book.chapters?.length || 0) > 0;
            const isTranslatingThisBook =
              translateMutation.isPending && translateMutation.variables === book.id;

            return (
              <div key={book.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ marginBottom: '0.25rem' }}>{book.title}</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{book.originalTitle}</p>
                  </div>
                  <span className={`badge badge-${book.status}`}>{book.status}</span>
                </div>

                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    <span>Overall Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="progress-bar-container">
                    <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {book.status === 'draft' && (
                    <button
                      onClick={() => {
                        setActionError(null);
                        translateMutation.mutate(book.id);
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                      disabled={isTranslatingThisBook || !hasChapters}
                      title={hasChapters ? undefined : 'Thêm ít nhất một chương trước khi dịch'}
                    >
                      {isTranslatingThisBook ? <RotateCw size={16} className="spin" /> : <Play size={16} />}
                      {hasChapters ? 'Start Translation' : 'Chưa có chương'}
                    </button>
                  )}
                  {(book.status === 'partial' || book.status === 'completed') && (
                    <Link to={`/book/${book.id}/read`} className="btn" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                      <BookOpen size={16} /> Read
                    </Link>
                  )}
                  {book.status === 'processing' && (
                    <button className="btn btn-secondary" disabled style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                      <RotateCw size={16} className="spin" /> Translating...
                    </button>
                  )}
                  <Link
                    to={`/upload?bookId=${book.id}`}
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    <Plus size={16} /> Thêm chương
                  </Link>
                </div>

                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <h4 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Chapters ({book.chapters?.length || 0})</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {book.chapters?.map(chapter => (
                      <div key={chapter.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.3)', padding: '0.5rem', borderRadius: '6px' }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                          {chapter.chapterNumber}. {chapter.titleTranslated || chapter.titleOriginal}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{chapter.totalSegments ? Math.round((chapter.completedSegments / chapter.totalSegments) * 100) : 0}%</span>
                          {chapter.status === 'failed' && <AlertCircle size={14} color="var(--danger)" />}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        </>
      )}
      <style>{`
        .spin { animation: spin 2s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default DashboardPage;
