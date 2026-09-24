import pino, { type DestinationStream, type Logger } from 'pino'

const SECRET_KEYS = ['authorization', 'cookie', 'password', 'token', 'code', 'secret']

export function createLogger(destination?: DestinationStream): Logger {
  const options = {
    level: process.env.LOG_LEVEL ?? 'info',
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: [...SECRET_KEYS, ...SECRET_KEYS.map(key => `*.${key}`)], censor: '[redacted]' },
  }
  return destination ? pino(options, destination) : pino(options)
}

export const log = createLogger()
