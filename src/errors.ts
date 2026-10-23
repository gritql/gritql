export type ErrorCode =
  | 'PARSE'
  | 'TYPE'
  | 'ARGS'
  | 'UNKNOWN_RESOLVER'
  | 'DIALECT'
  | 'PLAN'
  | 'EXECUTE'
  | 'RESULT'

export class GritqlError extends Error {
  code: ErrorCode
  path?: string[]
  cause?: unknown

  constructor(code: ErrorCode, message: string, options: { path?: string[]; cause?: unknown } = {}) {
    super(message)
    this.name = 'GritqlError'
    this.code = code
    if (options.path) this.path = options.path
    if (options.cause !== undefined) this.cause = options.cause
  }
}

/** Wraps any thrown value into a GritqlError with the given code unless it already is one. */
export function toGritqlError(code: ErrorCode, e: unknown, path?: string[]): GritqlError {
  if (e instanceof GritqlError) return e
  const message = e instanceof Error ? e.message : String(e)
  return new GritqlError(code, message, { path, cause: e })
}
