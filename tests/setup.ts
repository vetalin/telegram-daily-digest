import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Mock external services
jest.mock('node-telegram-bot-api');
jest.mock('openai');

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Setup global test utilities
global.beforeEach(() => {
  jest.clearAllMocks();
});

// Suppress console output in tests unless needed
if (!process.env.VERBOSE_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}
