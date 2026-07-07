import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBook,
  uploadChapters,
  fetchBookOptions,
  fetchBookChaptersForUpload,
  replaceChapterFile,
} from '../api';
import {
  Upload,
  FileText,
  ChevronLeft,
  Plus,
  Trash2,
  BookOpen,
  RefreshCcw,
  Search,
} from 'lucide-react';
import type {
  BookSummary,
  ChapterSummary,
  PaginatedChaptersResponse,
} from '../store';

type UploadMode = 'new' | 'existing';

interface ChapterFileSlot {
  id: string;
  file: File | null;
  chapterNumber: number;
}

const createSlot = (index: number, chapterNumber: number): ChapterFileSlot => ({
  id: `slot-${Date.now()}-${index}-${chapterNumber}`,
  file: null,
  chapterNumber,
});

const UPLOAD_PAGE_SIZE = 6;

const UploadPage = () => {
  const [searchParams] = useSearchParams();
  const preselectedBookId = searchParams.get('bookId') || '';

  const [mode, setMode] = useState<UploadMode>(preselectedBookId ? 'existing' : 'new');
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [selectedBookId, setSelectedBookId] = useState(preselectedBookId);
  const [slots, setSlots] = useState<ChapterFileSlot[]>([createSlot(0, 1)]);
  const [error, setError] = useState('');
  const [chapterSearch, setChapterSearch] = useState('');
  const [chapterPage, setChapterPage] = useState(1);
  const [replacementFiles, setReplacementFiles] = useState<Record<string, File | null>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: books = [] } = useQuery<BookSummary[]>({
    queryKey: ['book-options'],
    queryFn: fetchBookOptions,
  });

  const createBookMutation = useMutation({
    mutationFn: (data: { title: string; originalTitle?: string }) =>
      createBook(data.title, data.originalTitle),
  });

  const uploadMutation = useMutation({
    mutationFn: ({
      bookId,
      file,
      chapterNumberStart,
    }: {
      bookId: string;
      file: File;
      chapterNumberStart?: number;
    }) => uploadChapters(bookId, file, chapterNumberStart),
  });

  const replaceChapterMutation = useMutation({
    mutationFn: ({ chapterId, file }: { chapterId: string; file: File }) =>
      replaceChapterFile(chapterId, file),
  });

  const { data: chapterData } = useQuery<PaginatedChaptersResponse>({
    queryKey: ['upload-chapters', selectedBookId, chapterSearch, chapterPage],
    queryFn: () =>
      fetchBookChaptersForUpload(selectedBookId, {
        search: chapterSearch,
        page: chapterPage,
        pageSize: UPLOAD_PAGE_SIZE,
      }),
    enabled: mode === 'existing' && Boolean(selectedBookId),
  });

  const nextChapterNumber = chapterData?.nextChapterNumber ?? 1;

  useEffect(() => {
    if (mode === 'existing') {
      setSlots([createSlot(0, nextChapterNumber)]);
    }
  }, [mode, nextChapterNumber, selectedBookId]);

  const addSlot = () => {
    setSlots((previous) => [
      ...previous,
      createSlot(previous.length, previous[previous.length - 1].chapterNumber + 1),
    ]);
  };

  const removeSlot = (id: string) => {
    setSlots((previous) => previous.filter((slot) => slot.id !== id));
  };

  const setSlotFile = (id: string, file: File) => {
    setSlots((previous) =>
      previous.map((slot) => (slot.id === id ? { ...slot, file } : slot)),
    );
  };

  const setSlotChapterNumber = (id: string, chapterNumber: number) => {
    setSlots((previous) =>
      previous.map((slot) =>
        slot.id === id ? { ...slot, chapterNumber } : slot,
      ),
    );
  };

  const isPending =
    createBookMutation.isPending ||
    uploadMutation.isPending ||
    replaceChapterMutation.isPending;

  const hasExistingBookSelected = mode === 'existing' && Boolean(selectedBookId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const filledSlots = slots.filter(s => s.file !== null);
    if (filledSlots.length === 0) {
      setError('Vui lòng chọn ít nhất một file chương.');
      return;
    }

    try {
      let bookId = selectedBookId;

      if (mode === 'new') {
        if (!title) { setError('Nhập tên truyện.'); return; }
        const book = await createBookMutation.mutateAsync({ title, originalTitle });
        bookId = book.id;
      }

      for (const slot of filledSlots) {
        await uploadMutation.mutateAsync({
          bookId,
          file: slot.file!,
          chapterNumberStart: mode === 'existing' ? slot.chapterNumber : undefined,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['books'] });
      queryClient.invalidateQueries({ queryKey: ['upload-chapters'] });
      navigate(`/books/${bookId}`);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Upload thất bại. Kiểm tra backend logs.');
    }
  };

  const replaceSelectedChapterFile = async (chapter: ChapterSummary) => {
    const file = replacementFiles[chapter.id];

    if (!file) {
      setError('Vui lòng chọn file mới trước khi upload lại.');
      return;
    }

    setError('');

    try {
      await replaceChapterMutation.mutateAsync({ chapterId: chapter.id, file });
      setReplacementFiles((previous) => ({ ...previous, [chapter.id]: null }));
      queryClient.invalidateQueries({ queryKey: ['books'] });
      queryClient.invalidateQueries({ queryKey: ['book', selectedBookId] });
      queryClient.invalidateQueries({ queryKey: ['upload-chapters', selectedBookId] });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Upload lại chương thất bại.');
    }
  };

  const chapterItems = chapterData?.items ?? [];
  const chapterListSummary = useMemo(() => {
    if (!chapterData) {
      return '';
    }

    const startItem = (chapterData.page - 1) * chapterData.pageSize + 1;
    const endItem = Math.min(
      chapterData.totalItems,
      chapterData.page * chapterData.pageSize,
    );

    return `${startItem}-${endItem} / ${chapterData.totalItems} chương`;
  }, [chapterData]);

  return (
    <div className="upload-page">
      <div className="upload-back-link">
        <Link to="/" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
          <ChevronLeft size={16} /> Dashboard
        </Link>
      </div>

      <div className="upload-hero">
        <div className="upload-hero-mark">
          <Upload size={24} color="var(--color-brand)" />
        </div>
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>Upload Chương Truyện</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Hỗ trợ file .txt và .docx</p>
        </div>
      </div>

      <div className="upload-mode-switch">
        <button
          type="button"
          onClick={() => {
            setMode('new');
            setError('');
          }}
          className={mode === 'new' ? 'upload-mode-button active' : 'upload-mode-button'}
        >
          Truyện mới
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('existing');
            setError('');
          }}
          className={mode === 'existing' ? 'upload-mode-button active' : 'upload-mode-button'}
        >
          Thêm vào truyện cũ
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          {mode === 'new' ? (
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Tên tiếng Việt</label>
                <input
                  className="input"
                  placeholder="Vd: Đấu Phá Thương Khung"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Tên tiếng Trung (không bắt buộc)</label>
                <input
                  className="input"
                  placeholder="Vd: 斗破苍穹"
                  value={originalTitle}
                  onChange={e => setOriginalTitle(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label>Chọn truyện</label>
              {books.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <BookOpen size={18} color="var(--text-muted)" />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Chưa có truyện nào. Hãy tạo truyện mới.</span>
                </div>
              ) : (
                <select
                  className="input"
                  value={selectedBookId}
                  onChange={e => {
                    setSelectedBookId(e.target.value);
                    setChapterPage(1);
                    setChapterSearch('');
                    setReplacementFiles({});
                    setError('');
                  }}
                  required
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">-- Chọn truyện --</option>
                  {books.map((b: BookSummary) => (
                    <option key={b.id} value={b.id}>{b.title}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div className="upload-card-header">
            <div>
              <h3 style={{ marginBottom: '0.25rem', fontSize: '1rem' }}>Danh sách chương</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                Mỗi file là một hoặc nhiều chương. Backend sẽ tự tách theo pattern <code style={{ background: 'rgba(99,102,241,0.15)', padding: '0 4px', borderRadius: '4px' }}>第X章</code> / <code style={{ background: 'rgba(99,102,241,0.15)', padding: '0 4px', borderRadius: '4px' }}>Chapter X</code>
              </p>
            </div>
            <button
              type="button"
              onClick={addSlot}
              className="btn btn-secondary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Plus size={16} /> Thêm file
            </button>
          </div>

          {hasExistingBookSelected ? (
            <div className="upload-next-number-hint">
              Số chương kế tiếp được đề xuất từ chương mới nhất hiện có: <strong>{nextChapterNumber}</strong>
            </div>
          ) : null}

          <div className="upload-slot-list">
            {slots.map((slot, idx) => (
              <FileSlotRow
                key={slot.id}
                slot={slot}
                index={idx}
                showChapterNumber={mode === 'existing'}
                onFileChange={setSlotFile}
                onChapterNumberChange={setSlotChapterNumber}
                onRemove={slots.length > 1 ? () => removeSlot(slot.id) : undefined}
              />
            ))}
          </div>
        </div>

        {hasExistingBookSelected ? (
          <div className="card upload-existing-chapters-card">
            <div className="upload-card-header">
              <div>
                <h3 style={{ marginBottom: '0.25rem', fontSize: '1rem' }}>Các chương hiện có</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                  Sắp xếp theo chương mới nhất. Chọn file mới để upload lại, backend sẽ xóa segment cũ của chapter đó và dịch lại từ đầu.
                </p>
              </div>

              <div className="upload-search-box">
                <Search size={16} color="var(--color-text-tertiary)" />
                <input
                  className="input"
                  value={chapterSearch}
                  onChange={(event) => {
                    setChapterSearch(event.target.value);
                    setChapterPage(1);
                  }}
                  placeholder="Tìm theo tiêu đề chương..."
                  style={{ marginBottom: 0 }}
                />
              </div>
            </div>

            {chapterItems.length === 0 ? (
              <div className="upload-empty-state">Chưa có chương nào trong truyện này.</div>
            ) : (
              <div className="existing-chapter-list">
                {chapterItems.map((chapter) => (
                  <ExistingChapterRow
                    key={chapter.id}
                    chapter={chapter}
                    replacementFile={replacementFiles[chapter.id] ?? null}
                    isPending={replaceChapterMutation.isPending}
                    onReplacementFileChange={(file) =>
                      setReplacementFiles((previous) => ({
                        ...previous,
                        [chapter.id]: file,
                      }))
                    }
                    onReplace={() => replaceSelectedChapterFile(chapter)}
                  />
                ))}
              </div>
            )}

            <div className="upload-pagination">
              <span>{chapterListSummary}</span>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={(chapterData?.page ?? 1) <= 1}
                  onClick={() => setChapterPage((current) => current - 1)}
                >
                  Trang trước
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={(chapterData?.page ?? 1) >= (chapterData?.totalPages ?? 1)}
                  onClick={() => setChapterPage((current) => current + 1)}
                >
                  Trang sau
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {error && (
          <div style={{ marginTop: '1rem', padding: '0.875rem 1rem', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#f87171', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <Link to="/" className="btn btn-secondary">Hủy</Link>
          <button type="submit" className="btn" disabled={isPending}>
            {isPending ? 'Đang upload...' : 'Upload và tự động dịch'}
          </button>
        </div>
      </form>
    </div>
  );
};

interface FileSlotRowProps {
  slot: ChapterFileSlot;
  index: number;
  showChapterNumber: boolean;
  onFileChange: (id: string, file: File) => void;
  onChapterNumberChange: (id: string, chapterNumber: number) => void;
  onRemove?: () => void;
}

const FileSlotRow = ({
  slot,
  index,
  showChapterNumber,
  onFileChange,
  onChapterNumberChange,
  onRemove,
}: FileSlotRowProps) => {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className={slot.file ? 'upload-slot-row has-file' : 'upload-slot-row'}>
      <div className="upload-slot-index">
        {index + 1}
      </div>

      {showChapterNumber ? (
        <div className="upload-slot-number">
          <label>Số chương</label>
          <input
            className="input"
            type="number"
            min={1}
            value={slot.chapterNumber}
            onChange={(event) =>
              onChapterNumberChange(
                slot.id,
                Math.max(1, Number.parseInt(event.target.value || '1', 10)),
              )
            }
          />
        </div>
      ) : null}

      <div style={{ flex: 1, minWidth: 0 }}>
        {slot.file ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={16} color="var(--primary)" />
            <span style={{ fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {slot.file.name}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              ({(slot.file.size / 1024).toFixed(1)} KB)
            </span>
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Chưa chọn file...</span>
        )}
      </div>

      <input
        ref={ref}
        type="file"
        accept=".txt,.docx"
        style={{ display: 'none' }}
        onChange={e => {
          if (e.target.files?.[0]) onFileChange(slot.id, e.target.files[0]);
        }}
      />

      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="btn btn-secondary"
        style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}
      >
        {slot.file ? 'Đổi file' : 'Chọn file'}
      </button>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
};

interface ExistingChapterRowProps {
  chapter: ChapterSummary;
  replacementFile: File | null;
  isPending: boolean;
  onReplacementFileChange: (file: File | null) => void;
  onReplace: () => void;
}

const ExistingChapterRow = ({
  chapter,
  replacementFile,
  isPending,
  onReplacementFileChange,
  onReplace,
}: ExistingChapterRowProps) => {
  const ref = useRef<HTMLInputElement>(null);
  const progress =
    chapter.totalSegments === 0
      ? 0
      : Math.round((chapter.completedSegments / chapter.totalSegments) * 100);

  return (
    <div className="existing-chapter-row">
      <div className="existing-chapter-main">
        <div className="existing-chapter-topline">
          <div>
            <strong>Chương {chapter.chapterNumber}</strong>
            <div className="existing-chapter-title">
              {chapter.titleTranslated || chapter.titleOriginal}
            </div>
          </div>
          <span className={`badge badge-${chapter.status}`}>{chapter.status}</span>
        </div>

        <div className="existing-chapter-meta">
          <span>{chapter.sourceFileName || 'Chưa có tên file đã lưu'}</span>
          <span>
            {chapter.sourceFileSize
              ? `${(chapter.sourceFileSize / 1024).toFixed(1)} KB`
              : 'Không rõ dung lượng'}
          </span>
          <span>
            {chapter.completedSegments}/{chapter.totalSegments} segment
          </span>
        </div>

        <div className="existing-chapter-progress">
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <span>{progress}%</span>
        </div>
      </div>

      <div className="existing-chapter-actions">
        <input
          ref={ref}
          type="file"
          accept=".txt,.docx"
          style={{ display: 'none' }}
          onChange={(event) => {
            const nextFile = event.target.files?.[0] ?? null;
            onReplacementFileChange(nextFile);
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => ref.current?.click()}
        >
          <FileText size={16} />
          <span>{replacementFile ? 'Đổi file mới' : 'Chọn file mới'}</span>
        </button>
        {replacementFile ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onReplacementFileChange(null)}
          >
            <Trash2 size={16} />
            <span>Bỏ file</span>
          </button>
        ) : null}
        <button
          type="button"
          className="btn"
          disabled={!replacementFile || isPending}
          onClick={onReplace}
        >
          <RefreshCcw size={16} />
          <span>{isPending ? 'Đang upload...' : 'Upload lại'}</span>
        </button>
        {replacementFile ? (
          <div className="existing-chapter-replacement-file">
            {replacementFile.name} ({(replacementFile.size / 1024).toFixed(1)} KB)
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default UploadPage;
