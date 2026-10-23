/**
 * Runtime argument validation with the PropTypes-style API gritql has always
 * exposed (`PropTypes.string.isRequired`, `PropTypes.shape({...})`, ...).
 *
 * A checker is a function `(props, key, owner, location, fullName) => Error | null`.
 * `checkPropTypes(spec, values, location, owner)` runs a spec over an object
 * and throws the first error.
 */

export type Checker = ((
  props: Record<string, any>,
  propName: string | number,
  owner: string,
  location: string,
  propFullName: string,
) => Error | null) & { isRequired: Checker }

export class PropTypeError extends Error {
  data: Record<string, any>
  constructor(message: string, data?: Record<string, any>) {
    super(message)
    this.data = data ?? {}
    this.stack = ''
  }
}

const has = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k)

function getPropType(v: any): string {
  if (Array.isArray(v)) return 'array'
  if (v instanceof RegExp) return 'object'
  return typeof v
}

function getPreciseType(v: any): string {
  if (v === null || v === undefined) return String(v)
  const t = getPropType(v)
  if (t === 'object') {
    if (v instanceof Date) return 'date'
    if (v instanceof RegExp) return 'regexp'
  }
  return t
}

function chainable(
  validate: (
    props: Record<string, any>,
    propName: string | number,
    owner: string,
    location: string,
    propFullName: string,
  ) => Error | null,
): Checker {
  function check(
    isRequired: boolean,
    props: Record<string, any>,
    propName: string | number,
    owner: string,
    location: string,
    propFullName?: string,
  ): Error | null {
    owner = owner || '<<anonymous>>'
    const fullName = propFullName || String(propName)
    const value = props[propName]
    if (value == null) {
      if (!isRequired) return null
      return new PropTypeError(
        `The ${location} \`${fullName}\` is marked as required in \`${owner}\`, but its value is \`${
          value === null ? 'null' : 'undefined'
        }\`.`,
      )
    }
    return validate(props, propName, owner, location, fullName)
  }
  const optional = ((p, n, o, l, f) => check(false, p, n, o, l, f)) as Checker
  optional.isRequired = ((p, n, o, l, f) => check(true, p, n, o, l, f)) as Checker
  return optional
}

const invalid = (location: string, fullName: string, detail: string, owner: string, data?: any) =>
  new PropTypeError(`Invalid ${location} \`${fullName}\` ${detail} supplied to \`${owner}\`${data?.tail ?? '.'}`, data)

function primitive(expected: string): Checker {
  return chainable((props, name, owner, location, full) => {
    const value = props[name]
    if (getPropType(value) !== expected) {
      return new PropTypeError(
        `Invalid ${location} \`${full}\` of type \`${getPreciseType(value)}\` supplied to \`${owner}\`, expected \`${expected}\`.`,
        { expectedType: expected },
      )
    }
    return null
  })
}

function arrayOf(inner: Checker): Checker {
  return chainable((props, name, owner, location, full) => {
    if (typeof inner !== 'function') {
      return new PropTypeError(`Property \`${full}\` of component \`${owner}\` has invalid PropType notation inside arrayOf.`)
    }
    const value = props[name]
    if (!Array.isArray(value)) {
      return new PropTypeError(
        `Invalid ${location} \`${full}\` of type \`${getPropType(value)}\` supplied to \`${owner}\`, expected an array.`,
      )
    }
    for (let i = 0; i < value.length; i++) {
      const err = inner(value, i, owner, location, `${full}[${i}]`)
      if (err instanceof Error) return err
    }
    return null
  })
}

function objectOf(inner: Checker): Checker {
  return chainable((props, name, owner, location, full) => {
    if (typeof inner !== 'function') {
      return new PropTypeError(`Property \`${full}\` of component \`${owner}\` has invalid PropType notation inside objectOf.`)
    }
    const value = props[name]
    if (getPropType(value) !== 'object') {
      return new PropTypeError(
        `Invalid ${location} \`${full}\` of type \`${getPropType(value)}\` supplied to \`${owner}\`, expected an object.`,
      )
    }
    for (const key in value) {
      if (!has(value, key)) continue
      const err = inner(value, key, owner, location, `${full}.${key}`)
      if (err instanceof Error) return err
    }
    return null
  })
}

function oneOf(expected: readonly any[]): Checker {
  if (!Array.isArray(expected)) throw new Error('Invalid argument supplied to oneOf, expected an array.')
  return chainable((props, name, owner, location, full) => {
    const value = props[name]
    for (const e of expected) if (Object.is(value, e)) return null
    const list = JSON.stringify(expected, (_k, v) => (typeof v === 'symbol' ? String(v) : v))
    return new PropTypeError(
      `Invalid ${location} \`${full}\` of value \`${String(value)}\` supplied to \`${owner}\`, expected one of ${list}.`,
    )
  })
}

function oneOfType(checkers: readonly Checker[]): Checker {
  if (!Array.isArray(checkers) || checkers.some((c) => typeof c !== 'function')) {
    throw new Error('Invalid argument supplied to oneOfType, expected an array of check functions.')
  }
  return chainable((props, name, owner, location, full) => {
    const expectedTypes: string[] = []
    for (const checker of checkers) {
      const res = checker(props, name, owner, location, full)
      if (res == null) return null
      const data = (res as PropTypeError).data
      if (data && has(data, 'expectedType')) expectedTypes.push(data.expectedType)
    }
    const tail = expectedTypes.length ? `, expected one of type [${expectedTypes.join(', ')}].` : '.'
    return new PropTypeError(`Invalid ${location} \`${full}\` supplied to \`${owner}\`${tail}`)
  })
}

function invalidValidator(owner: string, location: string, full: string, key: string, type: string) {
  return new PropTypeError(
    `${owner}: ${location} type \`${full}.${key}\` is invalid; it must be a function, usually from the \`prop-types\` package, but received \`${type}\`.`,
  )
}

function shape(shapeTypes: Record<string, Checker>, exact = false): Checker {
  return chainable((props, name, owner, location, full) => {
    const value = props[name]
    if (getPropType(value) !== 'object') {
      return new PropTypeError(
        `Invalid ${location} \`${full}\` of type \`${getPropType(value)}\` supplied to \`${owner}\`, expected \`object\`.`,
      )
    }
    const keys = exact ? Object.keys({ ...value, ...shapeTypes }) : Object.keys(shapeTypes)
    for (const key of keys) {
      const checker = shapeTypes[key]
      if (has(shapeTypes, key) && typeof checker !== 'function') {
        return invalidValidator(owner, location, full, key, getPreciseType(checker))
      }
      if (!checker) {
        return new PropTypeError(
          `Invalid ${location} \`${full}\` key \`${key}\` supplied to \`${owner}\`.\nBad object: ${JSON.stringify(
            value,
            null,
            '  ',
          )}\nValid keys: ${JSON.stringify(Object.keys(shapeTypes), null, '  ')}`,
        )
      }
      const err = checker(value, key, owner, location, `${full}.${key}`)
      if (err) return err
    }
    return null
  })
}

function tuple(...checkers: Checker[]): Checker {
  return chainable((props, name, owner, location, full) => {
    const value = props[name]
    if (!Array.isArray(value)) {
      return new PropTypeError(
        `Invalid ${location} \`${full}\` of type \`${getPropType(value)}\` supplied to \`${owner}\`, expected ${checkers.length}-element array.`,
      )
    }
    if (value.length !== checkers.length) {
      return new PropTypeError(
        `Invalid ${location} \`${full}\` supplied to \`${owner}\`, expected ${checkers.length}-element array but got array of length ${value.length}.`,
      )
    }
    for (let i = 0; i < checkers.length; i++) {
      const err = checkers[i](value, i, owner, location, `${full}[${i}]`)
      if (err instanceof Error) return err
    }
    return null
  })
}

/** Fixed keys validated by `fixed`; every other key by `keyType`/`valueType`. */
function map(fixed: Record<string, Checker>, keyType: Checker, valueType: Checker): Checker {
  const fixedShape = shape(fixed)
  return chainable((props, name, owner, location, full) => {
    const err = fixedShape(props, name, owner, location, full)
    if (err) return err
    const value = props[name]
    for (const key in value) {
      if (!has(value, key) || has(fixed, key)) continue
      const keyErr = keyType({ [key]: key }, key, owner, location, `${full}.${key}`)
      if (keyErr) return keyErr
      const valErr = valueType(value, key, owner, location, `${full}.${key}`)
      if (valErr) return valErr
    }
    return null
  })
}

export const PropTypes = {
  array: primitive('array'),
  bigint: primitive('bigint'),
  bool: primitive('boolean'),
  func: primitive('function'),
  number: primitive('number'),
  object: primitive('object'),
  string: primitive('string'),
  any: chainable(() => null),
  arrayOf,
  objectOf,
  oneOf,
  oneOfType,
  shape: (s: Record<string, Checker>) => shape(s, false),
  exact: (s: Record<string, Checker>) => shape(s, true),
  tuple,
  map,
}

export type ArgsSchema = Record<string, Checker>

/**
 * Validates `values` against `spec`. Keys of `values` that are not in `spec`
 * are ignored. Throws on the first failure.
 */
export function checkPropTypes(
  spec: Record<string, any>,
  values: Record<string, any>,
  location: string,
  owner: string,
): void {
  for (const key in spec) {
    if (!has(spec, key)) continue
    const checker = spec[key]
    if (typeof checker !== 'function') {
      throw new PropTypeError(
        `${owner}: ${location} type \`${key}\` is invalid; it must be a function, usually from the \`prop-types\` package, but received \`${getPreciseType(
          checker,
        )}\`.`,
      )
    }
    const err = checker(values, key, owner, location, null as any)
    if (err && !(err instanceof Error)) {
      throw new PropTypeError(
        `${owner}: type specification of ${location} \`${key}\` is invalid; the type checker function must return \`null\` or an \`Error\` but returned a ${typeof err}.`,
      )
    }
    if (err) throw new Error(`Failed ${location} type: ${err.message}`)
  }
}
