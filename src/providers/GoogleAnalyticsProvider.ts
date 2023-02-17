import knexConstructor, { Knex } from 'knex'
import { SourceProvider } from '../entities/SourceProvider'

export class PostgresProvider implements SourceProvider {
  configuration: any
  connector: any
  keywords: []
  queryBuilder: 'ga'
  getQueryBuilder() {
    const promise: any = Promise.resolve()

    promise.clone = () => promise

    return promise
  }
  getQueryPromise(_, builder) {
    return builder
  }
  enableWith(this: any, query: any) {
    throw new Error(
      `${this.queryBuilder} provider doesn't support 'with' operation`,
    )
  }
  getConnector() {
    throw new Error('Must be implemented by integration')
  }
  getConnection() {
    throw new Error('Must be implemented by integration')
  }
  execute() {
    throw new Error('Must be implemented by integration')
  }
  prepare(query, promise) {
    return promise.then(() => ({
      dimensions: Array.from(new Set(query.dimensions)).reduce(
        arrayToGaString,
        '',
      ),
      metrics: Array.from(new Set(query.metrics)).reduce(arrayToGaString, ''),
      sort:
        query.orderBys?.length > 0
          ? query.orderBys.reduce(arrayToGaString, '')
          : undefined,
    }))
  }
  postTransform(result) {
    const {
      data: {
        data: { gapiReport: report },
      },
    } = result

    if (result?.data?.errors?.length > 0) {
      let error = result.data.errors[0]
      if (result.data.errors[0].extensions?.googleAnalyticsError) {
        error = result.data.errors[0].extensions?.googleAnalyticsError[0]
      }
      throw new Error(
        `${error?.reason ? `${error?.reason}: ` : ''}${error.message}`,
      )
    }

    return report?.data?.rows.map((row) => {
      let result = {}
      if (row.dimensions) {
        report?.columnHeader?.dimensions &&
          report.columnHeader.dimensions.forEach((dimName, i) => {
            result[dimName.replace('ga:', '')] = row.dimensions[i]
          })
      }
      report?.columnHeader?.metricHeader?.metricHeaderEntries &&
        report.columnHeader.metricHeader.metricHeaderEntries.forEach(
          (metric, i) => {
            result[metric?.name.replace('ga:', '')] = row.metrics[0].values[i]
          },
        )
      return result
    })
  }
  getFiltersResolver(filters) {
    return (queryPromise) => {
      return queryPromise.then((payload) => {
        return {
          ...payload,
          ...filters.reduce((r, f) => {
            r[f[0].replace('_', '-')] = f[2]
            return r
          }, {}),
        }
      })
    }
  }
}

function arrayToGaString(r, el, i) {
  return r + el.replace(/^(-?)(\w)/, (i === 0 ? '' : ',') + '$1ga:$2')
}
