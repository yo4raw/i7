import { vi } from 'vitest';

// Mock environment variables
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost/test?sslmode=require');

// Global test setup
beforeEach(() => {
  vi.clearAllMocks();
});