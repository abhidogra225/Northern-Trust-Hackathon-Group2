const redis = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const publisher = redis.createClient({ url: REDIS_URL });
const subscriber = redis.createClient({ url: REDIS_URL });

publisher.on('error', (err) => console.error('Redis publisher error', err));
subscriber.on('error', (err) => console.error('Redis subscriber error', err));

async function connect() {
  if (!publisher.isOpen) await publisher.connect();
  if (!subscriber.isOpen) await subscriber.connect();
}

async function publish(event) {
  const channel = process.env.WORKFLOW_EVENTS_CHANNEL || 'workflow_events';
  const payload = typeof event === 'string' ? event : JSON.stringify(event);
  await publisher.publish(channel, payload);
}

async function subscribe(handler) {
  const channel = process.env.WORKFLOW_EVENTS_CHANNEL || 'workflow_events';
  await subscriber.subscribe(channel, (message) => {
    try {
      const event = JSON.parse(message);
      handler(event);
    } catch (err) {
      console.error('Failed to parse event message', err);
    }
  });
}

module.exports = {
  publisher,
  subscriber,
  connect,
  publish,
  subscribe,
};
