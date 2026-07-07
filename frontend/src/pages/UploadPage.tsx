import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { createBook, uploadChapters } from '../api';
import { Upload, FileText } from 'lucide-react';

const UploadPage = () => {
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createBookMutation = useMutation({
    mutationFn: (data: { title: string, originalTitle?: string }) => createBook(data.title, data.originalTitle)
  });

  const uploadMutation = useMutation({
    mutationFn: (data: { bookId: string, file: File }) => uploadChapters(data.bookId, data.file)
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !file) return;

    try {
      const book = await createBookMutation.mutateAsync({ title, originalTitle });
      await uploadMutation.mutateAsync({ bookId: book.id, file });
      navigate('/');
    } catch (error) {
      console.error('Upload failed', error);
      alert('Upload failed. Please check backend logs.');
    }
  };

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.2)', padding: '1rem', borderRadius: '50%' }}>
          <Upload size={24} color="var(--primary)" />
        </div>
        <h2>Upload Novel</h2>
      </div>

      <form onSubmit={handleUpload}>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>Vietnamese Title</label>
            <input 
              className="input" 
              placeholder="e.g. Đấu Phá Thương Khung" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>Chinese Title (Optional)</label>
            <input 
              className="input" 
              placeholder="e.g. 斗破苍穹" 
              value={originalTitle}
              onChange={e => setOriginalTitle(e.target.value)}
            />
          </div>
        </div>

        <div className="input-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={16} /> Novel Text File (.txt)
          </label>
          <div 
            style={{ 
              border: '2px dashed var(--border-color)', 
              borderRadius: '8px', 
              padding: '2rem', 
              textAlign: 'center',
              cursor: 'pointer'
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              accept=".txt"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  setFile(e.target.files[0]);
                }
              }}
            />
            {file ? (
              <p style={{ color: 'var(--primary)' }}>Selected: {file.name}</p>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>Click to browse or drag and drop a .txt file</p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            type="submit" 
            className="btn" 
            disabled={createBookMutation.isPending || uploadMutation.isPending}
          >
            {(createBookMutation.isPending || uploadMutation.isPending) ? 'Uploading...' : 'Create and Upload'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default UploadPage;
