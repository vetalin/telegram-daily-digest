-- Initial Database Schema for Telegram Daily Digest Bot
-- Created: 2025-08-05

-- Enable UUID extension for better primary keys (optional)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table to store user profiles and preferences
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL, -- Telegram user ID
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    preferences JSONB DEFAULT '{}', -- User preferences (notification settings, interests, etc.)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Channels table to store information about monitored channels
CREATE TABLE channels (
    channel_id SERIAL PRIMARY KEY,
    telegram_channel_id BIGINT UNIQUE NOT NULL, -- Telegram channel ID
    channel_name VARCHAR(255) NOT NULL,
    channel_username VARCHAR(255), -- @username of the channel
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User-Channel subscriptions (many-to-many relationship)
CREATE TABLE user_channels (
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    channel_id INT REFERENCES channels(channel_id) ON DELETE CASCADE,
    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, channel_id)
);

-- Messages table to store messages from channels
CREATE TABLE messages (
    message_id SERIAL PRIMARY KEY,
    telegram_message_id BIGINT NOT NULL, -- Telegram message ID
    channel_id INT REFERENCES channels(channel_id) ON DELETE CASCADE,
    sender_id BIGINT, -- Telegram user ID of sender (can be null for channels)
    content TEXT NOT NULL,
    media_type VARCHAR(50), -- text, photo, video, document, etc.
    media_url TEXT, -- URL to media if applicable
    is_filtered BOOLEAN DEFAULT false, -- true if message passed content filters
    is_processed BOOLEAN DEFAULT false, -- true if processed by AI
    importance_score INTEGER DEFAULT 0, -- AI-generated importance score (0-100)
    category VARCHAR(100), -- AI-generated category
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(telegram_message_id, channel_id) -- Prevent duplicate messages
);

-- Digests table to store daily summaries
CREATE TABLE digests (
    digest_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    digest_date DATE NOT NULL,
    title VARCHAR(500),
    content TEXT NOT NULL,
    summary TEXT, -- Short summary of the digest
    message_count INTEGER DEFAULT 0, -- Number of messages included
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, digest_date) -- One digest per user per day
);

-- Digest Messages (many-to-many: which messages are included in which digests)
CREATE TABLE digest_messages (
    digest_id INT REFERENCES digests(digest_id) ON DELETE CASCADE,
    message_id INT REFERENCES messages(message_id) ON DELETE CASCADE,
    PRIMARY KEY (digest_id, message_id)
);

-- Notifications table to track sent notifications
CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    message_id INT REFERENCES messages(message_id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL, -- immediate, digest, system
    title VARCHAR(255),
    content TEXT,
    is_sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Keywords table for user interests and filtering
CREATE TABLE keywords (
    keyword_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    keyword VARCHAR(255) NOT NULL,
    weight DECIMAL(3,2) DEFAULT 1.0, -- Importance weight (0.0 - 10.0)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_channels_telegram_id ON channels(telegram_channel_id);
CREATE INDEX idx_messages_channel_id ON messages(channel_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_importance ON messages(importance_score);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_digests_user_date ON digests(user_id, digest_date);

-- Full-text search index for message content
CREATE INDEX idx_messages_content_fts ON messages USING gin(to_tsvector('russian', content));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digests_updated_at BEFORE UPDATE ON digests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample data for testing
INSERT INTO users (telegram_id, username, first_name, preferences) VALUES
(123456789, 'testuser', 'Test User', '{"notifications": true, "digest_time": "09:00"}');

INSERT INTO channels (telegram_channel_id, channel_name, channel_username, description) VALUES
(-1001234567890, 'Test News Channel', 'testnews', 'Sample news channel for testing');

-- Comments on tables for documentation
COMMENT ON TABLE users IS 'User profiles and preferences for the Telegram bot';
COMMENT ON TABLE channels IS 'Telegram channels being monitored by the bot';
COMMENT ON TABLE messages IS 'Messages collected from monitored channels';
COMMENT ON TABLE digests IS 'Daily digest summaries generated for users';
COMMENT ON TABLE notifications IS 'Notifications sent to users';
COMMENT ON TABLE keywords IS 'User-defined keywords for content filtering';

COMMENT ON COLUMN users.preferences IS 'JSONB storing user preferences like notification settings, interests, etc.';
COMMENT ON COLUMN messages.importance_score IS 'AI-generated score from 0-100 indicating message importance';
COMMENT ON COLUMN messages.is_filtered IS 'True if message passed spam/ad filtering';
COMMENT ON COLUMN messages.is_processed IS 'True if message has been processed by AI for categorization';