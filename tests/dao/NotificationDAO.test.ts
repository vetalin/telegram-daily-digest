/**
 * Тесты для NotificationDAO
 */

import { NotificationDAO } from '../../src/database/dao/NotificationDAO';
import {
  CreateNotificationData,
  NotificationType,
} from '../../src/database/models';
import { db } from '../../src/database/connection';

describe('NotificationDAO', () => {
  let notificationDAO: NotificationDAO;

  beforeAll(async () => {
    notificationDAO = new NotificationDAO();
  });

  beforeEach(async () => {
    // Очищаем таблицу уведомлений перед каждым тестом
    await db.query('DELETE FROM notifications');
  });

  afterAll(async () => {
    // Очищаем после всех тестов
    await db.query('DELETE FROM notifications');
  });

  describe('create', () => {
    it('должен создать новое уведомление', async () => {
      const notificationData: CreateNotificationData = {
        user_id: 1,
        message_id: 1,
        notification_type: 'immediate' as NotificationType,
        title: 'Тестовое уведомление',
        content: 'Это тестовое уведомление',
      };

      const result = await notificationDAO.create(notificationData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.user_id).toBe(1);
      expect(result.data?.notification_type).toBe('immediate');
      expect(result.data?.title).toBe('Тестовое уведомление');
      expect(result.data?.content).toBe('Это тестовое уведомление');
      expect(result.data?.is_sent).toBe(false);
    });

    it('должен создать уведомление без title и message_id', async () => {
      const notificationData: CreateNotificationData = {
        user_id: 2,
        notification_type: 'digest' as NotificationType,
        content: 'Уведомление без заголовка',
      };

      const result = await notificationDAO.create(notificationData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.title).toBeNull();
      expect(result.data?.message_id).toBeNull();
    });
  });

  describe('getById', () => {
    it('должен получить уведомление по ID', async () => {
      // Создаем уведомление
      const createResult = await notificationDAO.create({
        user_id: 1,
        notification_type: 'immediate' as NotificationType,
        content: 'Тест получения по ID',
      });

      expect(createResult.success).toBe(true);
      const notificationId = createResult.data!.notification_id;

      // Получаем по ID
      const result = await notificationDAO.getById(notificationId);

      expect(result.success).toBe(true);
      expect(result.data?.notification_id).toBe(notificationId);
      expect(result.data?.content).toBe('Тест получения по ID');
    });

    it('должен вернуть ошибку для несуществующего ID', async () => {
      const result = await notificationDAO.getById(999999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Notification not found');
    });
  });

  describe('getAll', () => {
    beforeEach(async () => {
      // Создаем тестовые уведомления
      await notificationDAO.create({
        user_id: 1,
        notification_type: 'immediate' as NotificationType,
        content: 'Уведомление 1',
      });
      await notificationDAO.create({
        user_id: 1,
        notification_type: 'digest' as NotificationType,
        content: 'Уведомление 2',
      });
      await notificationDAO.create({
        user_id: 2,
        notification_type: 'immediate' as NotificationType,
        content: 'Уведомление 3',
      });
    });

    it('должен получить все уведомления', async () => {
      const result = await notificationDAO.getAll();

      expect(result.success).toBe(true);
      expect(result.data?.items.length).toBe(3);
      expect(result.data?.pagination.totalCount).toBe(3);
    });

    it('должен фильтровать по user_id', async () => {
      const result = await notificationDAO.getAll({ user_id: 1 });

      expect(result.success).toBe(true);
      expect(result.data?.items.length).toBe(2);
      expect(result.data?.items.every((item) => item.user_id === 1)).toBe(true);
    });

    it('должен фильтровать по notification_type', async () => {
      const result = await notificationDAO.getAll({
        notification_type: 'immediate',
      });

      expect(result.success).toBe(true);
      expect(result.data?.items.length).toBe(2);
      expect(
        result.data?.items.every(
          (item) => item.notification_type === 'immediate',
        ),
      ).toBe(true);
    });

    it('должен работать с пагинацией', async () => {
      const result = await notificationDAO.getAll({}, { page: 1, limit: 2 });

      expect(result.success).toBe(true);
      expect(result.data?.items.length).toBe(2);
      expect(result.data?.pagination.totalPages).toBe(2);
      expect(result.data?.pagination.hasNext).toBe(true);
      expect(result.data?.pagination.hasPrev).toBe(false);
    });
  });

  describe('update', () => {
    it('должен обновить статус отправки', async () => {
      // Создаем уведомление
      const createResult = await notificationDAO.create({
        user_id: 1,
        notification_type: 'immediate' as NotificationType,
        content: 'Тест обновления',
      });

      const notificationId = createResult.data!.notification_id;

      // Обновляем статус
      const result = await notificationDAO.update(notificationId, {
        is_sent: true,
        sent_at: new Date(),
      });

      expect(result.success).toBe(true);
      expect(result.data?.is_sent).toBe(true);
      expect(result.data?.sent_at).toBeDefined();
    });

    it('должен вернуть ошибку для пустого обновления', async () => {
      const result = await notificationDAO.update(1, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('No fields to update');
    });
  });

  describe('markAsSent', () => {
    it('должен отметить уведомление как отправленное', async () => {
      // Создаем уведомление
      const createResult = await notificationDAO.create({
        user_id: 1,
        notification_type: 'immediate' as NotificationType,
        content: 'Тест отметки отправки',
      });

      const notificationId = createResult.data!.notification_id;

      // Отмечаем как отправленное
      const result = await notificationDAO.markAsSent(notificationId);

      expect(result.success).toBe(true);
      expect(result.data?.is_sent).toBe(true);
      expect(result.data?.sent_at).toBeDefined();
    });
  });

  describe('getPendingForUser', () => {
    beforeEach(async () => {
      // Создаем уведомления для пользователя 1
      const notification1 = await notificationDAO.create({
        user_id: 1,
        notification_type: 'immediate' as NotificationType,
        content: 'Неотправленное уведомление 1',
      });

      const notification2 = await notificationDAO.create({
        user_id: 1,
        notification_type: 'immediate' as NotificationType,
        content: 'Неотправленное уведомление 2',
      });

      // Отмечаем одно как отправленное
      await notificationDAO.markAsSent(notification1.data!.notification_id);

      // Создаем уведомление для другого пользователя
      await notificationDAO.create({
        user_id: 2,
        notification_type: 'immediate' as NotificationType,
        content: 'Уведомление другого пользователя',
      });
    });

    it('должен получить только неотправленные уведомления пользователя', async () => {
      const result = await notificationDAO.getPendingForUser(1);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(result.data?.[0].content).toBe('Неотправленное уведомление 2');
      expect(result.data?.[0].is_sent).toBe(false);
    });

    it('должен вернуть пустой массив если нет неотправленных уведомлений', async () => {
      const result = await notificationDAO.getPendingForUser(999);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(0);
    });
  });

  describe('getStatsByUser', () => {
    beforeEach(async () => {
      // Создаем разные типы уведомлений для пользователя 1
      const immediate1 = await notificationDAO.create({
        user_id: 1,
        notification_type: 'immediate' as NotificationType,
        content: 'Срочное 1',
      });

      const immediate2 = await notificationDAO.create({
        user_id: 1,
        notification_type: 'immediate' as NotificationType,
        content: 'Срочное 2',
      });

      const digest1 = await notificationDAO.create({
        user_id: 1,
        notification_type: 'digest' as NotificationType,
        content: 'Дайджест 1',
      });

      // Отмечаем одно как отправленное
      await notificationDAO.markAsSent(immediate1.data!.notification_id);
    });

    it('должен получить статистику по пользователю', async () => {
      const result = await notificationDAO.getStatsByUser(1);

      expect(result.success).toBe(true);
      expect(result.data?.total).toBe(3);
      expect(result.data?.sent).toBe(1);
      expect(result.data?.pending).toBe(2);
      expect(result.data?.byType.immediate).toBe(2);
      expect(result.data?.byType.digest).toBe(1);
    });
  });

  describe('delete', () => {
    it('должен удалить уведомление', async () => {
      // Создаем уведомление
      const createResult = await notificationDAO.create({
        user_id: 1,
        notification_type: 'immediate' as NotificationType,
        content: 'Уведомление для удаления',
      });

      const notificationId = createResult.data!.notification_id;

      // Удаляем
      const deleteResult = await notificationDAO.delete(notificationId);
      expect(deleteResult.success).toBe(true);

      // Проверяем что удалено
      const getResult = await notificationDAO.getById(notificationId);
      expect(getResult.success).toBe(false);
    });

    it('должен вернуть ошибку для несуществующего уведомления', async () => {
      const result = await notificationDAO.delete(999999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Notification not found');
    });
  });
});
