import { create } from 'zustand';

export interface Chapter {
  id: string;
  chapterNumber: number;
  titleOriginal: string;
  titleTranslated?: string;
  status: 'pending' | 'splitting' | 'translating' | 'done' | 'failed';
  totalSegments: number;
  completedSegments: number;
  translatedContent?: string;
}

export interface Book {
  id: string;
  title: string;
  originalTitle?: string;
  status: 'draft' | 'processing' | 'partial' | 'completed' | 'failed';
  chapters?: Chapter[];
}

interface AppState {
  books: Book[];
  // If needed, we can keep global client-side state here.
  // But for now, react-query handles server state.
}

export const useAppStore = create<AppState>(() => ({
  books: [],
}));
