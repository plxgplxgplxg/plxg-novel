import { create } from 'zustand';

export interface ChapterSummary {
  id: string;
  bookId: string;
  chapterNumber: number;
  titleOriginal: string;
  titleTranslated?: string;
  status: 'pending' | 'splitting' | 'translating' | 'done' | 'failed';
  totalSegments: number;
  completedSegments: number;
  createdAt?: string;
  updatedAt?: string;
  sourceFileName?: string;
  sourceFileSize?: number;
  canManage?: boolean;
}

export interface ChapterDetail extends ChapterSummary {
  translatedContent?: string;
}

export interface BookSummary {
  id: string;
  title: string;
  originalTitle?: string;
  status: 'draft' | 'processing' | 'partial' | 'completed' | 'failed';
  chapterCount: number;
  translatedChapterCount: number;
  totalSegments: number;
  completedSegments: number;
  createdAt?: string;
  canManage?: boolean;
}

export interface BookDetail extends BookSummary {
  sourceLang?: string;
  targetLang?: string;
  chapters: ChapterSummary[];
}

export interface PaginatedBooksResponse {
  items: BookSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedChaptersResponse {
  items: ChapterSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  nextChapterNumber: number;
}

interface AppState {
  books: BookSummary[];
  // If needed, we can keep global client-side state here.
  // But for now, react-query handles server state.
}

export const useAppStore = create<AppState>(() => ({
  books: [],
}));
