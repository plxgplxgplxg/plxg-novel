import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createBookProgressStreamUrl, fetchBooks } from '../api';
import { Link } from 'react-router-dom';
import { BookOpen, BookText, Clock3, Search, Plus } from 'lucide-react';
import type { BookSummary } from '../store';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';

const formatBookProgress = (book: BookSummary) => {
  if (book.totalSegments === 0) {
    return 0;
  }

  return Math.round((book.completedSegments / book.totalSegments) * 100);
};

const STATUS_LABELS: Record<BookSummary['status'], string> = {
  draft: 'Nháp',
  processing: 'Đang dịch',
  partial: 'Một phần',
  completed: 'Hoàn thành',
  failed: 'Lỗi',
};

const DashboardPage = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['books', search, page],
    queryFn: () => fetchBooks({ search, page, pageSize: 9 }),
    staleTime: 30_000,
    gcTime: 120_000,
  });
  const books = data?.items ?? [];
  const activeBooks = (data?.items ?? []).filter((book) =>
    book.canManage && ['draft', 'processing'].includes(book.status),
  );
  const totalChapters = books.reduce((sum, book) => sum + book.chapterCount, 0);
  const translatedChapters = books.reduce(
    (sum, book) => sum + book.translatedChapterCount,
    0,
  );

  useEffect(() => {
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
  }, [activeBooks, queryClient]);

  if (isLoading) {
    return (
      <div className="page-loading-state">
        <div className="card loading-card">
          <span className="eyebrow">Dashboard</span>
          <h2>Đang tải thư viện</h2>
          <p>Dữ liệu sách và tiến độ dịch đang được đồng bộ.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h1>Thư viện truyện</h1>
          <p>
            Upload chương, dịch nền bằng worker và theo dõi tiến độ theo từng cuốn trong cùng một bảng điều phối.
          </p>
        </div>
        <div className="page-actions">
          {isAuthenticated ? (
            <Link to="/upload" className="btn">
              <Plus size={16} /> Upload truyện
            </Link>
          ) : (
            <Link to="/login" className="btn btn-secondary">
              Đăng nhập để dịch
            </Link>
          )}
        </div>
      </section>

      <section className="stats-grid">
        <div className="card stat-card">
          <span className="eyebrow">Tổng số</span>
          <strong>{data?.totalItems ?? 0}</strong>
          <span>Sách đang thuộc thư viện của công chúa.</span>
        </div>
        <div className="card stat-card">
          <span className="eyebrow">Chương</span>
          <strong>{totalChapters}</strong>
          <span>Tổng số chương đã được upload vào hệ thống.</span>
        </div>
        <div className="card stat-card">
          <span className="eyebrow">Đã dịch</span>
          <strong>{translatedChapters}</strong>
          <span>Số chương hiện đã ghép xong nội dung dịch.</span>
        </div>
      </section>

      <section className="card filter-card">
        <div className="search-field">
          <Search size={18} color="var(--color-text-tertiary)" />
          <input
            className="input"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên truyện..."
          />
        </div>
      </section>

      {books.length === 0 ? (
        <section className="card empty-state">
          <BookOpen size={48} />
          <h3>Chưa có truyện nào</h3>
          <p>Hãy upload bộ truyện đầu tiên để bắt đầu quy trình tách chương và dịch nền.</p>
        </section>
      ) : (
        <>
          <section className="book-grid">
            {books.map((book: BookSummary) => {
              const progress = formatBookProgress(book);

              return (
                <article key={book.id} className="card book-card">
                  <div className="book-card-header">
                    <div>
                      <h3>{book.title}</h3>
                      <p>{book.originalTitle || 'Chưa có tên gốc'}</p>
                    </div>
                    <span className={`badge badge-${book.status}`}>
                      {STATUS_LABELS[book.status]}
                    </span>
                  </div>

                  <div className="book-card-progress">
                    <div className="book-card-progress-topline">
                      <span>Tiến độ tổng</span>
                      <span>{book.completedSegments}/{book.totalSegments} đoạn ({progress}%)</span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="book-card-stats">
                    <div className="book-card-stat">
                      <BookText size={16} />
                      <div>
                        <span>Chương</span>
                        <strong>{book.chapterCount}</strong>
                      </div>
                    </div>
                    <div className="book-card-stat">
                      <Clock3 size={16} />
                      <div>
                        <span>Hoàn thành</span>
                        <strong>{book.translatedChapterCount}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="book-card-actions">
                    <Link to={`/books/${book.id}`} className="btn">
                      <BookOpen size={16} /> Xem chi tiết
                    </Link>
                    {book.canManage ? (
                      <Link to={`/upload?bookId=${book.id}`} className="btn btn-secondary">
                        <Plus size={16} /> Thêm chương
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
          <div className="pagination-bar">
            <span>{data?.totalItems ?? 0} truyện</span>
            <div className="page-actions">
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
