/**
 * Date helpers for @parse and @groupBy, without luxon. Values are read as
 * local time (SQL `YYYY-MM-DD HH:mm:ss`), or by `Date` for ISO strings with a
 * zone; outputs use the local zone, as luxon did in v3.
 */

const SQL = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/

export function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') return new Date(value)
  if (typeof value !== 'string') return null
  const m = SQL.exec(value)
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), +((m[7] ?? '0').padEnd(3, '0')))
  }
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

function offset(d: Date): string {
  const min = -d.getTimezoneOffset()
  const sign = min >= 0 ? '+' : '-'
  const abs = Math.abs(min)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

export const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const toIsoTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${offset(d)}`
export const toIso = (d: Date) => `${toIsoDate(d)}T${toIsoTime(d)}`

export function toIsoWeekDate(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const weekday = (date.getUTCDay() + 6) % 7 // Monday = 0
  date.setUTCDate(date.getUTCDate() - weekday + 3) // Thursday of this week decides the week-year
  const weekYear = date.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4))
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${weekYear}-W${pad(week)}-${weekday + 1}`
}

const TOKENS = /yyyy|yy|MM|M|dd|d|HH|H|mm|m|ss|s|SSS/g

export function formatDate(d: Date, pattern: string): string {
  return pattern.replace(TOKENS, (t) => {
    switch (t) {
      case 'yyyy':
        return String(d.getFullYear())
      case 'yy':
        return pad(d.getFullYear() % 100)
      case 'MM':
        return pad(d.getMonth() + 1)
      case 'M':
        return String(d.getMonth() + 1)
      case 'dd':
        return pad(d.getDate())
      case 'd':
        return String(d.getDate())
      case 'HH':
        return pad(d.getHours())
      case 'H':
        return String(d.getHours())
      case 'mm':
        return pad(d.getMinutes())
      case 'm':
        return String(d.getMinutes())
      case 'ss':
        return pad(d.getSeconds())
      case 's':
        return String(d.getSeconds())
      default:
        return pad(d.getMilliseconds(), 3)
    }
  })
}

/** ISO date of the start of the unit containing `value`; weeks start Monday */
export function groupStart(value: unknown, unit: string): unknown {
  const d = parseDateValue(value)
  if (!d) return value
  const y = d.getFullYear()
  const m = d.getMonth()
  const day = d.getDate()
  switch (unit) {
    case 'day':
      return toIsoDate(d)
    case 'week':
      return toIsoDate(new Date(y, m, day - ((d.getDay() + 6) % 7)))
    case 'month':
      return toIsoDate(new Date(y, m, 1))
    case 'quarter':
      return toIsoDate(new Date(y, m - (m % 3), 1))
    case 'year':
      return toIsoDate(new Date(y, 0, 1))
    default:
      return toIsoDate(d)
  }
}
