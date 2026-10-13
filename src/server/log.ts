import pino, { type DestinationStream, type LogFn, type Logger } from 'pino'

// Credentials and headers, at the top level and one level down. A one-time code only where a form's input carries one:
// `code` elsewhere is an error's SQLSTATE or errno, which a log line needs. Errors go under `err`, whose serializer keeps
// the message, the stack, the causes and properties such as `code`, but not the values a failed query ran with.
const SECRET_KEYS = ['authorization', 'cookie', 'password', 'token', 'secret']
const ONE_TIME_CODES = ['input.code', 'body.code']
// The values of a failed query: drizzle keeps them in `params`, Postgres quotes a failing row in `detail`. Either can
// hold a customer's email or name, which no log line keeps.
const QUERY_VALUES = ['params', 'detail']

/** The text drizzle adds to the message of every failed query in an error's chain: the values it ran with. */
function valueTexts(error: Error): string[] {
  const texts: string[] = []
  let current: unknown = error
  for (let depth = 0; current instanceof Error && depth < 10; depth++) {
    const { params, query } = current as Error & { params?: unknown; query?: unknown }
    if (Array.isArray(params) && typeof query === 'string') texts.push(`\nparams: ${params.join(',')}`)
    current = current.cause
  }
  return texts
}

/** pino's own serializer, without the values of a failed query, wherever they appear. */
export function serializeError(error: Error): pino.SerializedError {
  const serialized = pino.stdSerializers.err(error)
  for (const key of QUERY_VALUES) delete serialized[key]

  for (const text of valueTexts(error)) {
    serialized.message = serialized.message.replaceAll(text, '')
    serialized.stack = serialized.stack.replaceAll(text, '')
  }
  return serialized
}

/**
 * A call that gives an error and no message: pino would write the error's own message as the line's `msg`, values and
 * all. The serialized message goes there instead.
 */
function logMethod(this: Logger, args: Parameters<LogFn>, method: LogFn): void {
  const [merging] = args
  const holdsError = args.length === 1 && typeof merging === 'object' && merging !== null && 'err' in merging && merging.err instanceof Error
  if (holdsError) method.call(this, merging, serializeError(merging.err as Error).message)
  else method.apply(this, args)
}

/** A request's path without its query string, which can carry a search for an email or an invitation's token. */
export function pathOnly(path: string): string {
  return path.split('?', 1)[0]!
}

export function createLogger(destination?: DestinationStream): Logger {
  const options = {
    level: process.env.LOG_LEVEL ?? 'info',
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: [...SECRET_KEYS, ...SECRET_KEYS.map(key => `*.${key}`), ...ONE_TIME_CODES], censor: '[redacted]' },
    serializers: { err: serializeError },
    hooks: { logMethod },
  }
  return destination ? pino(options, destination) : pino(options)
}

export const log = createLogger()
