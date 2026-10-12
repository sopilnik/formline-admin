import pino, { type DestinationStream, type Logger } from 'pino'

// Credentials and headers, at the top level and one level down. A one-time code only where a form's input carries one:
// `code` elsewhere is an error's SQLSTATE or errno, which a log line needs. Errors go under `err`, whose serializer keeps
// the message, the stack, the causes and properties such as `code`.
const SECRET_KEYS = ['authorization', 'cookie', 'password', 'token', 'secret']
const ONE_TIME_CODES = ['input.code', 'body.code']

export function createLogger(destination?: DestinationStream): Logger {
  const options = {
    level: process.env.LOG_LEVEL ?? 'info',
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: [...SECRET_KEYS, ...SECRET_KEYS.map(key => `*.${key}`), ...ONE_TIME_CODES], censor: '[redacted]' },
  }
  return destination ? pino(options, destination) : pino(options)
}

export const log = createLogger()
