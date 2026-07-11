import { apiClient, API_URL } from './client';
import type {
  BookDetail,
  BookSummary,
  ChapterDetail,
  ChapterSummary,
  PaginatedChaptersResponse,
  PaginatedBooksResponse,
} from '../store';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface DemoAccount {
  email: string;
  password: string;
}

export const login = async (
  credentials: AuthCredentials,
): Promise<AuthResponse> => {
  const res = await apiClient.post('/auth/login', credentials);
  return res.data;
};

export const register = async (
  credentials: AuthCredentials,
): Promise<AuthResponse> => {
  const res = await apiClient.post('/auth/register', credentials);
  return res.data;
};

export const fetchCurrentUser = async (): Promise<AuthUser> => {
  const res = await apiClient.get('/auth/me');
  return res.data;
};

export const fetchDemoAccounts = async (): Promise<DemoAccount[]> => {
  const res = await apiClient.get('/auth/demo-accounts');
  return res.data;
};

export const fetchBooks = async (params?: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedBooksResponse> => {
  const res = await apiClient.get('/books', { params });
  return res.data;
};

export const fetchBookOptions = async (): Promise<BookSummary[]> => {
  const res = await fetchBooks({ page: 1, pageSize: 100 });
  return res.items;
};

export const fetchBookDetails = async (id: string): Promise<BookDetail> => {
  const res = await apiClient.get(`/books/${id}`);
  return res.data;
};

export const createBook = async (title: string, originalTitle?: string): Promise<BookDetail> => {
  const res = await apiClient.post('/books', { title, originalTitle });
  return res.data;
};

export const uploadChapters = async (
  bookId: string,
  file: File,
  chapterNumberStart?: number,
) => {
  const formData = new FormData();
  formData.append('file', file);
  if (chapterNumberStart) {
    formData.append('chapterNumberStart', String(chapterNumberStart));
  }
  const res = await apiClient.post(`/books/${bookId}/chapters/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const fetchBookChaptersForUpload = async (
  bookId: string,
  params?: {
    search?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<PaginatedChaptersResponse> => {
  const res = await apiClient.get(`/books/${bookId}/chapters`, { params });
  return res.data;
};

export const replaceChapterFile = async (
  chapterId: string,
  file: File,
): Promise<{ chapter: ChapterSummary; jobId: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post(`/chapters/${chapterId}/replace-file`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const startTranslation = async (bookId: string) => {
  const res = await apiClient.post(`/books/${bookId}/translate`);
  return res.data;
};

export const deleteBook = async (bookId: string) => {
  await apiClient.delete(`/books/${bookId}`);
};

export const createBookProgressStreamUrl = (bookId: string) => {
  const token = localStorage.getItem('plxg_novel_access_token');
  const url = new URL(`/books/${bookId}/progress-stream`, API_URL);
  if (token) {
    url.searchParams.set('token', token);
  }
  return url.toString();
};

export interface BookProgressEvent {
  bookId: string;
  chapterId: string;
  completed: number;
  total: number;
  percent: number;
  status?: 'pending' | 'splitting' | 'translating' | 'done' | 'failed';
}

export const fetchChapter = async (chapterId: string): Promise<ChapterDetail> => {
  const res = await apiClient.get(`/chapters/${chapterId}`);
  return res.data;
};

export const retranslateChapter = async (chapterId: string, retryFailedOnly: boolean = false) => {
  const res = await apiClient.post(`/chapters/${chapterId}/translate`, null, {
    params: { retryFailedOnly }
  });
  return res.data;
};
