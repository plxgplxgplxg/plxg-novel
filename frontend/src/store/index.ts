import { create } from 'zustand';

export interface Chapter {
  id: string;
  chapter_number: number;
  title_original: string;
  title_translated?: string;
  status: 'pending' | 'splitting' | 'translating' | 'done' | 'failed';
  total_segments: number;
  completed_segments: number;
  translated_content?: string;
}

export interface Book {
  id: string;
  title: string;
  original_title: string;
  status: 'draft' | 'processing' | 'partial' | 'completed' | 'failed';
  chapters: Chapter[];
}

interface AppState {
  books: Book[];
  addBook: (book: Book) => void;
  updateBookStatus: (id: string, status: Book['status']) => void;
  updateChapterProgress: (bookId: string, chapterId: string, completed: number, total: number) => void;
  simulateTranslation: (bookId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  books: [
    {
      id: '1',
      title: 'Đấu Phá Thương Khung',
      original_title: '斗破苍穹',
      status: 'partial',
      chapters: [
        {
          id: 'c1',
          chapter_number: 1,
          title_original: '第一章 陨落的天才',
          title_translated: 'Chương 1: Thiên tài ngã xuống',
          status: 'done',
          total_segments: 100,
          completed_segments: 100,
          translated_content: 'Đấu Khí đại lục, không có ma pháp hoa tiếu mị ảnh, chỉ có đấu khí sinh sôi đến đỉnh phong!...\n\nThiếu niên mỉm cười, nụ cười mang theo vài phần tự giễu.'
        },
        {
          id: 'c2',
          chapter_number: 2,
          title_original: '第二章 斗气大陆',
          title_translated: 'Chương 2: Đấu Khí Đại Lục',
          status: 'translating',
          total_segments: 120,
          completed_segments: 45,
        }
      ]
    }
  ],
  addBook: (book) => set((state) => ({ books: [...state.books, book] })),
  updateBookStatus: (id, status) => set((state) => ({
    books: state.books.map(b => b.id === id ? { ...b, status } : b)
  })),
  updateChapterProgress: (bookId, chapterId, completed, total) => set((state) => ({
    books: state.books.map(b => b.id === bookId ? {
      ...b,
      chapters: b.chapters.map(c => c.id === chapterId ? {
        ...c,
        completed_segments: completed,
        total_segments: total,
        status: completed === total ? 'done' : 'translating'
      } : c)
    } : b)
  })),
  simulateTranslation: (bookId) => {
    const interval = setInterval(() => {
      set((state) => {
        const book = state.books.find(b => b.id === bookId);
        if (!book) {
          clearInterval(interval);
          return state;
        }

        let allDone = true;
        const updatedChapters: Chapter[] = book.chapters.map(c => {
          if (c.status === 'done') return c;
          
          let nextCompleted = c.completed_segments + Math.floor(Math.random() * 5) + 1;
          if (nextCompleted >= c.total_segments) {
            nextCompleted = c.total_segments;
          } else {
            allDone = false;
          }

          return {
            ...c,
            completed_segments: nextCompleted,
            status: nextCompleted === c.total_segments ? 'done' : 'translating'
          };
        });

        return {
          books: state.books.map(b => b.id === bookId ? {
            ...b,
            status: allDone ? 'completed' : 'processing',
            chapters: updatedChapters
          } : b)
        };
      });
    }, 1000);
  }
}));
