// config/redis.js
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Redis client
const redis = new Redis(process.env.REDIS_URL);

// Handle Redis connection events
redis.on('connect', () => {
    console.log('[LOG] Successfully connected to Redis');
});

redis.on('error', (error) => {
    console.error('[LOG] Redis connection error:', error);
});

// Helper functions for state management
export const redisHelpers = {
    async setHelpNeeded(value) {
        try {
            await redis.set('isHelpNeeded', value ? '1' : '0');
            console.log(`[LOG] Help needed status set to: ${value}`);
        } catch (error) {
            console.error('[LOG] Error setting help needed status:', error);
        }
    },

    async getHelpNeeded() {
        try {
            const value = await redis.get('isHelpNeeded');
            return value === '1';
        } catch (error) {
            console.error('[LOG] Error getting help needed status:', error);
            return false;
        }
    },

    async setPendingResponse(chatId, value) {
        try {
            await redis.hset('pendingResponses', chatId, value ? '1' : '0');
            console.log(`[LOG] Pending response status set for ${chatId}: ${value}`);
        } catch (error) {
            console.error('[LOG] Error setting pending response:', error);
        }
    },

    async getPendingResponse(chatId) {
        try {
            const value = await redis.hget('pendingResponses', chatId);
            return value === '1';
        } catch (error) {
            console.error('[LOG] Error getting pending response:', error);
            return false;
        }
    },

    async setLatestResponse(response) {
        try {
            await redis.set('latestResponse', JSON.stringify(response));
        } catch (error) {
            console.error('[LOG] Error setting latest response:', error);
        }
    },

    async getLatestResponse() {
        try {
            const response = await redis.get('latestResponse');
            return response ? JSON.parse(response) : null;
        } catch (error) {
            console.error('[LOG] Error getting latest response:', error);
            return null;
        }
    }
};

export default redis;