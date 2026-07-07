import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createBookProgressStreamUrl, fetchBookDetails } from '../api';
import { ChevronLeft, BookOpen, ListOrdered, ScrollText } from 'lucide-react';

const STATUS_LABELS = {
  draft: 'Nháp',
  processing: 'Đang dịch',
  partial: 'Một phần',
  completed: 'Hoàn thành',
  failed: 'Lỗi',
} as const;

const CHAPTER_STATUS_LABELS = {
  pending: 'Chờ xử lý',
  splitting: 'Đang tách',
  translating: 'Đang dịch',
  done: 'Hoàn thành',
  failed: 'Lỗi',
} as const;

const BookDetailPage = () => {
  const { bookId } = useParams<{ bookId: string }>();
  const queryClient = useQueryClient();

  const { data: book, isLoading } = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => fetchBookDetails(bookId!),
    enabled: !!bookId,
  });

  useEffect(() => {
    if (
      !bookId ||
      !book?.canManage ||
      !['draft', 'processing'].includes(book.status)
    ) {
      return;
    }

    const stream = new EventSource(createBookProgressStreamUrl(bookId));
    stream.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ['book', bookId] });
      queryClient.invalidateQueries({ queryKey: ['books'] });
    };
    stream.onerror = () => stream.close();

    return () => stream.close();
  }, [book?.canManage, book?.status, bookId, queryClient]);

  if (isLoading) {
    return (
      <div className="page-loading-state">
        <div className="card loading-card">
          <span className="eyebrow">Book</span>
          <h2>Đang tải thông tin truyện</h2>
          <p>Hệ thống đang tổng hợp trạng thái chương và tiến độ dịch.</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="page-loading-state">
        <div className="card loading-card">
          <span className="eyebrow">Book</span>
          <h2>Không tìm thấy truyện</h2>
          <p>Cuốn truyện này không còn tồn tại hoặc bạn không có quyền truy cập.</p>
        </div>
      </div>
    );
  }

  const progress =
    book.totalSegments === 0
      ? 0
      : Math.round((book.completedSegments / book.totalSegments) * 100);

  return (
    <div className="page-stack">
      <div className="page-back-link">
        <Link to="/" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
          <ChevronLeft size={16} /> Trang chủ
        </Link>
      </div>

      <section className="page-hero">
        <div>
          <span className="eyebrow">Book detail</span>
          <h1>{book.title}</h1>
          <p>{book.originalTitle || 'Chưa có tên nguyên tác'}.</p>
        </div>
        <div className="page-actions">
          {book.canManage ? (
            <Link to={`/upload?bookId=${book.id}`} className="btn btn-secondary">
              <ScrollText size={16} /> Quản lý chương
            </Link>
          ) : null}
        </div>
      </section>

      <section className="card detail-hero-card">
        <div className="detail-hero-topline">
          <div>
            <span className="eyebrow">Trạng thái sách</span>
            <h2>{STATUS_LABELS[book.status]}</h2>
          </div>
          <span className={`badge badge-${book.status}`}>{STATUS_LABELS[book.status]}</span>
        </div>

        <div className="detail-progress-block">
          <div className="book-card-progress-topline">
            <span>Tiến độ dịch</span>
            <span>{book.completedSegments}/{book.totalSegments} đoạn ({progress}%)</span>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="detail-summary-grid">
          <div className="detail-summary-card">
            <span className="eyebrow">Chương</span>
            <strong>{book.chapterCount}</strong>
          </div>
          <div className="detail-summary-card">
            <span className="eyebrow">Đã dịch</span>
            <strong>{book.translatedChapterCount}</strong>
          </div>
          <div className="detail-summary-card">
            <span className="eyebrow">Ngôn ngữ</span>
            <strong>{book.sourceLang} → {book.targetLang}</strong>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <ListOrdered size={18} />
          <h3>Mục lục chương</h3>
        </div>

        <div className="chapter-list">
          {book.chapters.map((chapter) => {
            const canRead = chapter.status === 'done';
            const chapterProgress = chapter.totalSegments === 0 ? 0 : Math.round((chapter.completedSegments / chapter.totalSegments) * 100);

            return (
              <article key={chapter.id} className="chapter-row">
                <div className="chapter-row-main">
                  <div className="chapter-row-topline">
                    <strong>
                      Chương {chapter.chapterNumber}: {chapter.titleTranslated || chapter.titleOriginal}
                    </strong>
                    <span className={`badge badge-${chapter.status}`}>
                      {CHAPTER_STATUS_LABELS[chapter.status]}
                    </span>
                  </div>
                  <div className="chapter-row-meta">
                    <span>{chapter.completedSegments}/{chapter.totalSegments} đoạn</span>
                    <span>Cập nhật {chapter.updatedAt ? new Date(chapter.updatedAt).toLocaleDateString('vi-VN') : 'gần đây'}</span>
                  </div>
                  <div className="chapter-row-progress">
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ width: `${chapterProgress}%` }} />
                    </div>
                    <span>{chapterProgress}%</span>
                  </div>
                </div>

                {canRead ? (
                  <Link to={`/books/${book.id}/chapters/${chapter.id}`} className="btn">
                    <BookOpen size={16} /> Đọc
                  </Link>
                ) : (
                  <button className="btn btn-secondary" disabled>
                    Chưa sẵn sàng
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default BookDetailPage;
