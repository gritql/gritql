"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.providers = exports.disableOperationFor = exports.disableArgumentFor = void 0;
const knex_1 = __importDefault(require("knex"));
function arrayToGaString(r, el, i) {
    return r + el.replace(/^(-?)(\w)/, (i === 0 ? '' : ',') + '$1ga:$2');
}
function disableArgumentFor(query, argument, provider) {
    if (query.provider === provider) {
        throw new Error(`${provider} provider doesn't support '${argument}' argument`);
    }
}
exports.disableArgumentFor = disableArgumentFor;
function disableOperationFor(query, operation, provider) {
    if (query.provider === provider) {
        throw new Error(`${provider} provider doesn't support '${operation}' operation`);
    }
}
exports.disableOperationFor = disableOperationFor;
exports.providers = {
    pg: {
        // Basic list of keywords, you must provide more for resolvers with specific keywords
        keywords: [
            'GROUP BY',
            'WITHIN GROUP',
            'DATE_TRUNC',
            'DISTINCT',
            'SUM',
            'MIN',
            'MAX',
            'CAST',
            'FLOOR',
            'CEIL',
            'NULLIF',
            'OVER',
            'PARTITION BY',
            'ORDER BY',
            'COUNT',
            'AVG',
            'PLAINTO_TSQUERY',
            'TO_TSVECTOR',
            'TS_HEADLINE',
            'TS_RANK',
            'PERCENTILE_CONT',
            'RANK',
            'DENSE_RANK',
            'ROW_NUMBER',
            'JOIN',
            'ON',
            'FULL OUTER',
            'FULL',
            'INNER',
            'LEFT OUTER',
            'RIGHT OUTER',
            'LEFT',
            'RIGHT',
        ],
        queryBuilder: 'knex',
        getQueryBuilder() {
            return (0, knex_1.default)({ client: 'pg' });
        },
        getQueryPromise(query, builder) {
            return builder.select().from(query.table);
        },
        getConnector: () => require('postgres'),
        getConnection: (configuration, connector) => {
            let options = { max: configuration.pool?.max || 20 };
            if (!configuration.connection.connectionString) {
                options = {
                    ...configuration.connection,
                    ...options,
                };
            }
            const connection = configuration.connection.connectionString
                ? connector(configuration.connection.connectionString, options)
                : connector(options);
            return connection;
        },
        execute(connection, sql) {
            if (!connection) {
                throw new Error("Provider isn't configured yet, please use #setupProvider() to provide config");
            }
            const native = sql.toSQL().toNative();
            return connection.unsafe(native.sql, native.bindings || []);
        },
    },
    snowflake: {
        keywords: [
            'GROUP BY',
            'WITHIN GROUP',
            'DATE_TRUNC',
            'DISTINCT',
            'SUM',
            'MIN',
            'MAX',
            'CAST',
            'FLOOR',
            'CEIL',
            'NULLIF',
            'OVER',
            'PARTITION BY',
            'ORDER BY',
            'COUNT',
            'AVG',
            'RANK',
            'DENSE_RANK',
            'ROW_NUMBER',
            'MEDIAN',
            'JOIN',
            'ON',
            'FULL OUTER',
            'FULL',
            'INNER',
            'LEFT OUTER',
            'RIGHT OUTER',
            'LEFT',
            'RIGHT',
        ],
        queryBuilder: 'knex',
        getQueryBuilder() {
            return (0, knex_1.default)({ client: 'pg' });
        },
        getQueryPromise(query, builder) {
            return builder.select().from(query.table);
        },
        getConnector: () => {
            return require('snowflake-sdk');
        },
        getConnection: (configuration, connector) => {
            // Always connect trought pool, because snowflake has different interfaces for normal and pool connection
            return connector.createPool(configuration.connection.connectionString
                ? configuration.connection.connectionString
                : {
                    ...configuration.connection,
                }, configuration.pool || { min: 0, max: 20 });
        },
        execute: (connection, sql) => {
            if (!connection) {
                throw new Error("Provider isn't configured yet, please use #setupProvider() to provide config");
            }
            return connection.use(async (client) => {
                return await new Promise((resolve, reject) => client.execute({
                    sqlText: sql.toSQL().sql,
                    binds: sql.toSQL().bindings,
                    complete(err, stmt, rows) {
                        if (err) {
                            reject(err);
                        }
                        resolve(rows);
                    },
                }));
            });
        },
    },
    ga: {
        keywords: [],
        queryBuilder: 'ga',
        getQueryBuilder() {
            const promise = Promise.resolve();
            promise.clone = () => promise;
            return promise;
        },
        getQueryPromise(_, builder) {
            return builder;
        },
        getConnector() {
            throw new Error('Must be implemented by integration');
        },
        getConnection() {
            throw new Error('Must be implemented by integration');
        },
        execute() {
            throw new Error('Must be implemented by integration');
        },
        prepare(query, promise) {
            return promise.then(() => ({
                dimensions: Array.from(new Set(query.dimensions)).reduce(arrayToGaString, ''),
                metrics: Array.from(new Set(query.metrics)).reduce(arrayToGaString, ''),
                sort: query.orderBys?.length > 0
                    ? query.orderBys.reduce(arrayToGaString, '')
                    : undefined,
            }));
        },
        postTransform(result) {
            const { data: { data: { gapiReport: report }, }, } = result;
            if (result?.data?.errors?.length > 0) {
                let error = result.data.errors[0];
                if (result.data.errors[0].extensions?.googleAnalyticsError) {
                    error = result.data.errors[0].extensions?.googleAnalyticsError[0];
                }
                throw new Error(`${error?.reason ? `${error?.reason}: ` : ''}${error.message}`);
            }
            return report?.data?.rows.map((row) => {
                let result = {};
                if (row.dimensions) {
                    report?.columnHeader?.dimensions &&
                        report.columnHeader.dimensions.forEach((dimName, i) => {
                            result[dimName.replace('ga:', '')] = row.dimensions[i];
                        });
                }
                report?.columnHeader?.metricHeader?.metricHeaderEntries &&
                    report.columnHeader.metricHeader.metricHeaderEntries.forEach((metric, i) => {
                        result[metric?.name.replace('ga:', '')] = row.metrics[0].values[i];
                    });
                return result;
            });
        },
        getFiltersResolver(filters) {
            return (queryPromise) => {
                return queryPromise.then((payload) => {
                    return {
                        ...payload,
                        ...filters.reduce((r, f) => {
                            r[f[0].replace('_', '-')] = f[2];
                            return r;
                        }, {}),
                    };
                });
            };
        },
    },
};
