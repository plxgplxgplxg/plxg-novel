import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Upload, FileText } from 'lucide-react';

const UploadPage = () => {
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [rawText, setRawText] = useState('');
  const navigate = useNavigate();
  const addBook = useAppStore(state => state.addBook);

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !rawText) return;

    // Simulate simple chunking by chapters "第X章"
    const chapters = rawText.split(/(?=第[一二三四五六七八九十百千万\d]+章)/g).filter(c => c.trim().length > 0);
    
    const newBook = {
      id: Math.random().toString(36).substring(7),
      title: title || 'Untitled',
      original_title: originalTitle || 'Unknown',
      status: 'draft' as const,
      chapters: chapters.map((content, idx) => {
        const firstLine = content.split('\n')[0];
        const titleMatch = firstLine.match(/第.+?章.+/);
        return {
          id: Math.random().toString(36).substring(7),
          chapter_number: idx + 1,
          title_original: titleMatch ? titleMatch[0] : `Chapter ${idx + 1}`,
          status: 'pending' as const,
          total_segments: Math.max(10, Math.floor(content.length / 50)),
          completed_segments: 0
        };
      })
    };

    addBook(newBook);
    navigate('/');
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
            <FileText size={16} /> Raw Text (Chinese)
          </label>
          <textarea 
            className="textarea" 
            placeholder="Paste raw Chinese text here. Chapters should ideally start with 第X章..."
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            required
            style={{ height: '300px' }}
          ></textarea>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn">
            Create and Parse Book
          </button>
        </div>
      </form>
    </div>
  );
};

export default UploadPage;
