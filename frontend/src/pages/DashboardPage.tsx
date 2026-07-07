import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createBookProgressStreamUrl, fetchBooks } from '../api';
import { Link } from 'react-router-dom';
import { BookOpen, Search, Plus } from 'lucide-react';
import type { BookSummary } from '../store';
import { useEffect, useState } from 'react';

const DashboardPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['books', search, page],
    queryFn: () => fetchBooks({ search, page, pageSize: 9 }),
  });
  const books = data?.items ?? [];

  useEffect(() => {
    const activeBooks = books.filter((book) =>
      ['draft', 'processing'].includes(book.status),
    );

    if (activeBooks.length === 0) {
      return;
    }

    const streams = activeBooks.map((book) => {
      const stream = new EventSource(createBookProgressStreamUrl(book.id));

      stream.onmessage = () => {
        queryClient.invalidateQueries({ queryKey: ['books'] });
        queryClient.invalidateQueries({ queryKey: ['book', book.id] });
      };

      stream.onerror = () => {
        stream.close();
      };

      return stream;
    });

    return () => {
      streams.forEach((stream) => stream.close());
    };
  }, [books, queryClient]);

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: '4rem' }}>Loading...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2>Thư viện truyện</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Upload chương, dịch nền bằng worker và theo dõi tiến độ realtime.
          </p>
        </div>
        <Link to="/upload" className="btn">
          <Plus size={16} /> Upload truyện
        </Link>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Search size={18} color="var(--text-muted)" />
          <input
            className="input"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên truyện..."
            style={{ marginBottom: 0 }}
          />
        </div>
      </div>

      {books.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <BookOpen size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
          <h3>No books found</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Upload a Chinese novel to start translating.</p>
        </div>
      ) : (
        <>
          <div className="grid">
            {books.map((book: BookSummary) => {
            const progress = book.totalSegments === 0 ? 0 : Math.round((book.completedSegments / book.totalSegments) * 100);
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

                <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem', fontSize: '0.875rem' }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Số chương</div>
                    <div>{book.chapterCount}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Đã xong</div>
                    <div>{book.translatedChapterCount}</div>
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Link to={`/books/${book.id}`} className="btn" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                    <BookOpen size={16} /> Xem chi tiết
                  </Link>
                  <Link
                    to={`/upload?bookId=${book.id}`}
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    <Plus size={16} /> Thêm chương
                  </Link>
                </div>

              </div>
            );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {data?.totalItems ?? 0} truyện
            </span>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Trang trước
              </button>
              <button
                className="btn btn-secondary"
                disabled={page >= (data?.totalPages ?? 1)}
                onClick={() => setPage((current) => current + 1)}
              >
                Trang sau
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
