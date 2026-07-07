import { useState, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBook, uploadChapters, fetchBooks } from '../api';
import { Upload, FileText, ChevronLeft, Plus, Trash2, BookOpen } from 'lucide-react';
import type { Book } from '../store';

type UploadMode = 'new' | 'existing';

interface ChapterFileSlot {
  id: string;
  file: File | null;
  label: string;
}

const createSlot = (index: number): ChapterFileSlot => ({
  id: `slot-${Date.now()}-${index}`,
  file: null,
  label: `Chapter ${index + 1}`,
});

const UploadPage = () => {
  const [searchParams] = useSearchParams();
  const preselectedBookId = searchParams.get('bookId') || '';

  const [mode, setMode] = useState<UploadMode>(preselectedBookId ? 'existing' : 'new');
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [selectedBookId, setSelectedBookId] = useState(preselectedBookId);
  const [slots, setSlots] = useState<ChapterFileSlot[]>([createSlot(0)]);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: books = [] } = useQuery<Book[]>({
    queryKey: ['books'],
    queryFn: fetchBooks,
  });

  const createBookMutation = useMutation({
    mutationFn: (data: { title: string; originalTitle?: string }) =>
      createBook(data.title, data.originalTitle),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ bookId, file }: { bookId: string; file: File }) =>
      uploadChapters(bookId, file),
  });

  const addSlot = () => {
    setSlots(prev => [...prev, createSlot(prev.length)]);
  };

  const removeSlot = (id: string) => {
    setSlots(prev => prev.filter(s => s.id !== id));
  };

  const setSlotFile = (id: string, file: File) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, file } : s));
  };

  const isPending = createBookMutation.isPending || uploadMutation.isPending;

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

      await Promise.all(
        filledSlots.map(slot => uploadMutation.mutateAsync({ bookId, file: slot.file! }))
      );

      queryClient.invalidateQueries({ queryKey: ['books'] });
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Upload thất bại. Kiểm tra backend logs.');
    }
  };

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to="/" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
          <ChevronLeft size={16} /> Dashboard
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.2)', padding: '1rem', borderRadius: '50%' }}>
          <Upload size={24} color="var(--primary)" />
        </div>
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>Upload Chương Truyện</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Hỗ trợ file .txt và .docx</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', background: 'var(--bg-secondary)', borderRadius: '10px', padding: '4px' }}>
        <button
          type="button"
          onClick={() => setMode('new')}
          style={{
            flex: 1, padding: '0.625rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, transition: 'all 0.2s',
            background: mode === 'new' ? 'var(--primary)' : 'transparent',
            color: mode === 'new' ? '#fff' : 'var(--text-muted)',
          }}
        >
          Truyện mới
        </button>
        <button
          type="button"
          onClick={() => setMode('existing')}
          style={{
            flex: 1, padding: '0.625rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, transition: 'all 0.2s',
            background: mode === 'existing' ? 'var(--primary)' : 'transparent',
            color: mode === 'existing' ? '#fff' : 'var(--text-muted)',
          }}
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
                  onChange={e => setSelectedBookId(e.target.value)}
                  required
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">-- Chọn truyện --</option>
                  {books.map((b: Book) => (
                    <option key={b.id} value={b.id}>{b.title}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {slots.map((slot, idx) => (
              <FileSlotRow
                key={slot.id}
                slot={slot}
                index={idx}
                onFileChange={setSlotFile}
                onRemove={slots.length > 1 ? () => removeSlot(slot.id) : undefined}
              />
            ))}
          </div>
        </div>

        {error && (
          <div style={{ marginTop: '1rem', padding: '0.875rem 1rem', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#f87171', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <Link to="/" className="btn btn-secondary">Hủy</Link>
          <button type="submit" className="btn" disabled={isPending}>
            {isPending ? 'Đang upload...' : 'Upload và xử lý'}
          </button>
        </div>
      </form>
    </div>
  );
};

interface FileSlotRowProps {
  slot: ChapterFileSlot;
  index: number;
  onFileChange: (id: string, file: File) => void;
  onRemove?: () => void;
}

const FileSlotRow = ({ slot, index, onFileChange, onRemove }: FileSlotRowProps) => {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '0.875rem 1rem',
        background: 'rgba(15, 23, 42, 0.4)',
        border: `1px solid ${slot.file ? 'rgba(99, 102, 241, 0.5)' : 'var(--border-color)'}`,
        borderRadius: '8px',
        transition: 'border-color 0.2s',
      }}
    >
      <div style={{
        minWidth: '32px', height: '32px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)',
      }}>
        {index + 1}
      </div>

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

export default UploadPage;
