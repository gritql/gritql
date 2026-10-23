import { describe, test, expect } from 'vitest'
import { PropTypes, checkPropTypes } from '../src/types'

const check = (spec, value) => () =>
  checkPropTypes({ v: spec }, { v: value }, 'arguments', 'test')

describe('PropTypes', () => {
  describe('primitives', () => {
    test.each([
      ['string', 'a'],
      ['number', 1],
      ['bool', true],
      ['func', () => {}],
      ['object', {}],
      ['array', []],
      ['bigint', BigInt(1)],
    ])('%s accepts a matching value', (type, value) => {
      expect(check(PropTypes[type], value)).not.toThrow()
    })

    test.each([
      ['string', 1, /expected `string`/],
      ['number', 'a', /expected `number`/],
      ['bool', 'a', /expected `boolean`/],
      ['func', 'a', /expected `function`/],
      ['object', [], /of type `array`.*expected `object`/],
      ['array', {}, /expected `array`/],
    ])('%s rejects a wrong value', (type, value, message) => {
      expect(check(PropTypes[type], value)).toThrow(message)
    })

    test('undefined and null pass when optional', () => {
      expect(check(PropTypes.string, undefined)).not.toThrow()
      expect(check(PropTypes.string, null)).not.toThrow()
    })

    test('isRequired rejects undefined and null', () => {
      expect(check(PropTypes.string.isRequired, undefined)).toThrow(
        /is marked as required/,
      )
      expect(check(PropTypes.string.isRequired, null)).toThrow(
        /is marked as required/,
      )
    })
  })

  describe('any', () => {
    test('accepts anything defined', () => {
      expect(check(PropTypes.any, 1)).not.toThrow()
      expect(check(PropTypes.any, { a: [] })).not.toThrow()
    })

    test('isRequired still rejects undefined', () => {
      expect(check(PropTypes.any.isRequired, undefined)).toThrow(
        /is marked as required/,
      )
    })
  })

  describe('arrayOf', () => {
    const spec = PropTypes.arrayOf(PropTypes.number)

    test('accepts matching elements', () => {
      expect(check(spec, [1, 2])).not.toThrow()
      expect(check(spec, [])).not.toThrow()
    })

    test('rejects non-array', () => {
      expect(check(spec, 1)).toThrow(/expected an array/)
    })

    test('rejects wrong element', () => {
      expect(check(spec, [1, 'a'])).toThrow(/`v\[1\]`.*expected `number`/)
    })
  })

  describe('objectOf', () => {
    const spec = PropTypes.objectOf(PropTypes.number)

    test('accepts matching values', () => {
      expect(check(spec, { a: 1 })).not.toThrow()
    })

    test('rejects non-object', () => {
      expect(check(spec, [])).toThrow(/expected an object/)
    })

    test('rejects wrong value', () => {
      expect(check(spec, { a: 'x' })).toThrow(/`v\.a`.*expected `number`/)
    })
  })

  describe('oneOf', () => {
    const spec = PropTypes.oneOf(['asc', 'desc'])

    test('accepts listed values', () => {
      expect(check(spec, 'asc')).not.toThrow()
    })

    test('rejects other values', () => {
      expect(check(spec, 'up')).toThrow(/expected one of/)
    })
  })

  describe('oneOfType', () => {
    const spec = PropTypes.oneOfType([PropTypes.string, PropTypes.number])

    test('accepts either type', () => {
      expect(check(spec, 'a')).not.toThrow()
      expect(check(spec, 1)).not.toThrow()
    })

    test('rejects other types', () => {
      expect(check(spec, true)).toThrow(/Invalid arguments `v` supplied to `test`/)
    })
  })

  describe('shape and exact', () => {
    const shape = { a: PropTypes.string.isRequired, b: PropTypes.number }

    test('shape allows extra keys', () => {
      expect(check(PropTypes.shape(shape), { a: 'x', c: 1 })).not.toThrow()
    })

    test('shape enforces nested specs', () => {
      expect(check(PropTypes.shape(shape), { b: 1 })).toThrow(
        /`v\.a` is marked as required/,
      )
      expect(check(PropTypes.shape(shape), { a: 'x', b: 'y' })).toThrow(
        /`v\.b`.*expected `number`/,
      )
    })

    test('shape rejects non-object', () => {
      expect(check(PropTypes.shape(shape), 'x')).toThrow(/expected `object`/)
    })

    test('exact rejects extra keys', () => {
      expect(check(PropTypes.exact(shape), { a: 'x', c: 1 })).toThrow(/key `c`/)
    })

    test('exact accepts matching object', () => {
      expect(check(PropTypes.exact(shape), { a: 'x', b: 1 })).not.toThrow()
    })
  })

  describe('tuple', () => {
    const spec = PropTypes.tuple(PropTypes.string, PropTypes.number)

    test('accepts matching tuple', () => {
      expect(check(spec, ['a', 1])).not.toThrow()
    })

    test('rejects non-array', () => {
      expect(check(spec, 'a')).toThrow(/expected 2-element array/)
    })

    test('rejects wrong length', () => {
      expect(check(spec, ['a'])).toThrow(/got array of length 1/)
    })

    test('rejects wrong element type', () => {
      expect(check(spec, ['a', 'b'])).toThrow(/`v\[1\]`.*expected `number`/)
    })
  })

  describe('map', () => {
    const spec = PropTypes.map(
      { fixed: PropTypes.string },
      PropTypes.any,
      PropTypes.number,
    )

    test('accepts fixed keys and dynamic values', () => {
      expect(check(spec, { fixed: 'a', x: 1, y: 2 })).not.toThrow()
    })

    test('rejects non-object', () => {
      expect(check(spec, 'a')).toThrow(/expected `object`/)
    })

    test('rejects wrong fixed key type', () => {
      expect(check(spec, { fixed: 1 })).toThrow(/`v\.fixed`.*expected `string`/)
    })

    test('rejects wrong dynamic value type', () => {
      expect(check(spec, { x: 'a' })).toThrow(/`v\.x`.*expected `number`/)
    })
  })

  describe('checkPropTypes', () => {
    test('rejects a spec that is not a function', () => {
      expect(check('string', 'a')).toThrow(/must be a function/)
    })

    test('rejects a checker that returns a non-error', () => {
      expect(check(() => 'oops', 'a')).toThrow(/must return `null` or an `Error`/)
    })

    test('ignores keys that are not in the spec', () => {
      expect(() =>
        checkPropTypes({ a: PropTypes.string }, { a: 'x', b: 1 }, 'arguments', 'test'),
      ).not.toThrow()
    })
  })
})
