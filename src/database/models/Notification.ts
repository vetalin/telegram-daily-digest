/**
 * Notification model - represents notifications sent to users
 */

export type NotificationType = 'immediate' | 'digest' | 'system';

export interface Notification {
  notification_id: number;
  user_id: number;
  message_id?: number; // Optional, for message-related notifications
  notification_type: NotificationType;
  title?: string;
  content: string;
  is_sent: boolean;
  sent_at?: Date;
  created_at: Date;
}

export interface CreateNotificationData {
  user_id: number;
  message_id?: number;
  notification_type: NotificationType;
  title?: string;
  content: string;
}

export interface UpdateNotificationData {
  is_sent?: boolean;
  sent_at?: Date;
}

export interface NotificationQueue {
  notifications: Notification[];
  priority: 'high' | 'normal' | 'low';
  scheduled_at?: Date;
}
