import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createBookProgressStreamUrl, fetchBookDetails, fetchChapter } from '../api';
import { ChevronLeft, ChevronRight, List, LibraryBig } from 'lucide-react';

const isChapterReadable = (chapter?: {
  totalSegments: number;
  completedSegments: number;
}) =>
  Boolean(
    chapter &&
      chapter.totalSegments > 0 &&
      chapter.completedSegments >= chapter.totalSegments,
  );

const ReaderPage = () => {
  const { bookId, chapterId } = useParams<{ bookId: string; chapterId: string }>();
  const queryClient = useQueryClient();

  const { data: book, isLoading: isBookLoading } = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => fetchBookDetails(bookId!),
    enabled: !!bookId,
  });

  const currentChapterIdx = book?.chapters.findIndex((chapter) => chapter.id === chapterId) ?? -1;

  const {
    data: chapterDetail,
    isLoading: isChapterLoading,
    isError: isChapterError,
  } = useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: () => fetchChapter(chapterId!),
    enabled: !!chapterId,
  });

  useEffect(() => {
    if (!bookId || !book?.canManage) return;

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
  }, [book?.canManage, bookId, chapterId, queryClient]);

  if (isBookLoading) {
    return (
      <div className="page-loading-state">
        <div className="card loading-card">
          <span className="eyebrow">Reader</span>
          <h2>Đang tải chương truyện</h2>
          <p>Nội dung đọc đang được lấy từ chapter đã dịch xong.</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="page-loading-state">
        <div className="card loading-card">
          <span className="eyebrow">Reader</span>
          <h2>Không tìm thấy truyện</h2>
          <p>Liên kết đọc này không còn hợp lệ.</p>
        </div>
      </div>
    );
  }

  if (!book.chapters || book.chapters.length === 0) {
    return (
      <div className="page-loading-state">
        <div className="card loading-card">
          <span className="eyebrow">Reader</span>
          <h2>Chưa có chương nào</h2>
          <p>Cuốn truyện này chưa có nội dung để mở trong reader.</p>
        </div>
      </div>
    );
  }

  const currentChapter = chapterDetail;
  const prevChapter = currentChapterIdx > 0 ? book.chapters[currentChapterIdx - 1] : undefined;
  const nextChapter = currentChapterIdx >= 0 && currentChapterIdx < book.chapters.length - 1 ? book.chapters[currentChapterIdx + 1] : undefined;
  const canReadPrev = isChapterReadable(prevChapter);
  const canReadNext = isChapterReadable(nextChapter);

  if (isChapterLoading) {
    return (
      <div className="page-loading-state">
        <div className="card loading-card">
          <span className="eyebrow">Reader</span>
          <h2>Đang tải nội dung chương</h2>
          <p>Hệ thống đang lấy nội dung đã ghép và các segment fallback.</p>
        </div>
      </div>
    );
  }

  if (!currentChapter || isChapterError) {
    return (
      <div className="page-loading-state">
        <div className="card loading-card">
          <span className="eyebrow">Reader</span>
          <h2>Chương chưa sẵn sàng</h2>
          <p>Chương này chưa dịch xong, không còn tồn tại hoặc bạn không có quyền xem.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reader-container">
      <div className="reader-header">
        <div>
          <Link to={`/books/${book.id}`} style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <ChevronLeft size={16} /> Quay lại mục lục
          </Link>
          <h1>{book.title}</h1>
          <p>{currentChapter.chapterNumber ? `Chương ${currentChapter.chapterNumber}` : ''}</p>
        </div>
        <div className="reader-index-pill">
          <LibraryBig size={16} />
          <span>{currentChapterIdx >= 0 ? currentChapterIdx + 1 : '?'} / {book.chapters.length}</span>
        </div>
      </div>

      <article className="card reader-card">
        <h2 className="reader-chapter-title">
          {currentChapter.titleTranslated || currentChapter.titleOriginal}
        </h2>

        {currentChapter.failedSegmentCount ? (
          <div className="reader-warning">
            <strong>
              {currentChapter.failedSegmentCount} segment lỗi đang được fallback về nguyên văn tiếng Trung.
            </strong>
            <span>
              {currentChapter.readableSegmentCount ?? 0}/{currentChapter.totalSegments} segment vẫn dịch được và đang hiển thị bình thường.
            </span>
          </div>
        ) : null}

        <div className="reader-content reader-prose">
          {currentChapter.translatedContent || 'Nội dung trống.'}
        </div>

        {currentChapter.failedSegments?.length ? (
          <div className="reader-fallback-list">
            <h3>Segment fallback</h3>
            {currentChapter.failedSegments.map((segment) => (
              <article key={segment.segmentIndex} className="reader-fallback-item">
                <strong>Segment {segment.segmentIndex + 1}</strong>
                <p>{segment.errorMessage || 'Translation provider returned an unknown error.'}</p>
                <pre>{segment.sourceText}</pre>
              </article>
            ))}
          </div>
        ) : null}

        <div className="reader-footer">
          {prevChapter && canReadPrev ? (
            <Link to={`/books/${book.id}/chapters/${prevChapter.id}`} className="btn btn-secondary">
              <ChevronLeft size={18} /> Chương trước
            </Link>
          ) : (
            <button disabled className="btn btn-secondary">
              <ChevronLeft size={18} /> Chương trước
            </button>
          )}

          <div className="reader-position">
            <List size={18} /> {currentChapterIdx >= 0 ? currentChapterIdx + 1 : '?'} / {book.chapters.length}
          </div>

          {nextChapter && canReadNext ? (
            <Link to={`/books/${book.id}/chapters/${nextChapter.id}`} className="btn btn-secondary">
              Chương tiếp <ChevronRight size={18} />
            </Link>
          ) : (
            <button disabled className="btn btn-secondary">
              Chương tiếp <ChevronRight size={18} />
            </button>
          )}
        </div>
      </article>
    </div>
  );
};

export default ReaderPage;
