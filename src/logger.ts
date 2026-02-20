import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
}, pino.transport({
  targets: [
    { target: 'pino-pretty', options: { colorize: true }, level: 'info' },
    { target: 'pino/file', options: { destination: `./logs/bot-${process.env.ASSISTANT_NAME || 'debug'}.log` }, level: 'debug' }
  ]
}));
