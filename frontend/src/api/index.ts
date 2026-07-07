import { apiClient } from './client';
import type { Book, Chapter } from '../store';

export const login = async () => {
  try {
    const res = await apiClient.post('/auth/login', { email: 'user@example.com', password: 'password' });
    localStorage.setItem('token', res.data.accessToken);
    return res.data;
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 404) {
      const res = await apiClient.post('/auth/register', { email: 'user@example.com', password: 'password' });
      localStorage.setItem('token', res.data.accessToken);
      return res.data;
    }
    throw err;
  }
};

export const fetchBooks = async (): Promise<Book[]> => {
  const res = await apiClient.get('/books');
  const books = res.data;
  // Fetch details for each book to get chapters array
  const detailedBooks = await Promise.all(
    books.map((b: any) => apiClient.get(`/books/${b.id}`).then(r => r.data))
  );
  return detailedBooks;
};

export const fetchBookDetails = async (id: string): Promise<Book> => {
  const res = await apiClient.get(`/books/${id}`);
  return res.data;
};

export const createBook = async (title: string, originalTitle?: string): Promise<Book> => {
  const res = await apiClient.post('/books', { title, originalTitle });
  return res.data;
};

export const uploadChapters = async (bookId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post(`/books/${bookId}/chapters/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const startTranslation = async (bookId: string) => {
  const res = await apiClient.post(`/books/${bookId}/translate`);
  return res.data;
};

export const fetchChapter = async (chapterId: string): Promise<Chapter> => {
  const res = await apiClient.get(`/chapters/${chapterId}`);
  return res.data;
};
