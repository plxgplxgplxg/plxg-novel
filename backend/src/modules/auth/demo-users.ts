export interface DemoUserCredential {
  email: string;
  password: string;
}

export const DEMO_USER_CREDENTIALS: DemoUserCredential[] = [
  {
    email: 'rinchan@example.com',
    password: 'Password123',
  },
  {
    email: 'reader@example.com',
    password: 'Password123',
  },
  {
    email: 'translator@example.com',
    password: 'Password123',
  },
];
