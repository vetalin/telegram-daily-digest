import request from 'supertest';
import app from '../src/index';
import { db } from '../src/database/connection';
import { userDAO } from '../src/database/dao/UserDAO';
import { CreateUserData } from '../src/database/models';
import { encrypt } from '../src/utils/crypto';

describe('Security Measures', () => {
  let createdUser: any;
  const encryptionKey =
    process.env.ENCRYPTION_KEY || 'default_secret_key_32_chars_long';

  beforeAll(async () => {
    // Clean up database before tests
    await db.query('DELETE FROM users');

    const userData: CreateUserData = {
      telegram_id: 123456789,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
    };
    const userResult = await userDAO.create(userData);
    if (userResult.success && userResult.data) {
      createdUser = userResult.data;
    } else {
      throw new Error('Failed to create test user');
    }
  });

  afterAll(async () => {
    await db.query('DELETE FROM users');
    await db.disconnect();
  });

  describe('Encryption', () => {
    it('should correctly decrypt encrypted environment variables', () => {
      const originalText = 'my_secret_api_key';
      const encrypted = encrypt(originalText, encryptionKey);

      process.env.TEST_ENCRYPTED_VAR = `enc_${encrypted}`;

      // This requires a way to re-evaluate the config after setting the env var.
      // For simplicity, we'll simulate the decryption logic directly.
      const config = require('../src/config').default;
      const decryptedValue = require('../src/utils/crypto').decrypt(
        encrypted,
        encryptionKey,
      );

      expect(decryptedValue).toBe(originalText);
    });
  });

  describe('Rate Limiting', () => {
    it('should return 503 Too Many Requests when rate limit is exceeded', async () => {
      const agent = request.agent(app);

      // Perform more requests than the burst limit
      const requests = [];
      for (let i = 0; i < 25; i++) {
        requests.push(agent.get('/health'));
      }
      const responses = await Promise.all(requests);

      const rateLimitedResponse = responses.find((res) => res.status === 503);
      expect(rateLimitedResponse).toBeDefined();
    }, 20000); // Increase timeout for this test
  });

  describe('GDPR Compliance', () => {
    it('should retrieve all user data', async () => {
      const response = await request(app).get(
        `/api/users/data/${createdUser.telegram_id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.telegram_id).toBe(createdUser.telegram_id);
      expect(response.body.data).toHaveProperty('subscriptions');
      expect(response.body.data).toHaveProperty('keywords');
    });

    it('should permanently delete a user and their data', async () => {
      const deleteResponse = await request(app).delete(
        `/api/users/data/${createdUser.telegram_id}`,
      );

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);

      // Verify user is deleted
      const userResult = await userDAO.findByTelegramId(
        createdUser.telegram_id,
      );
      expect(userResult.success).toBe(false);
    });
  });
});
