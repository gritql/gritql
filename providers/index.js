"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
exports.__esModule = true;
exports.providers = void 0;
exports.providers = {
    pg: {
        // For knex optimizations for postgres
        client: 'pg',
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
        getConnector: function () { return require('postgres'); },
        getConnection: function (configuration, connector) {
            var _a;
            var options = { max: ((_a = configuration.pool) === null || _a === void 0 ? void 0 : _a.max) || 20 };
            if (!configuration.connection.connectionString) {
                options = __assign(__assign({}, configuration.connection), options);
            }
            var connection = configuration.connection.connectionString
                ? connector(configuration.connection.connectionString, options)
                : connector(options);
            return connection;
        },
        execute: function (connection, sql) {
            if (!connection) {
                throw new Error("Provider isn't configured yet, please use #setupProvider() to provide config");
            }
            var native = sql.toNative();
            return connection.unsafe(native.sql, native.bindings || []);
        }
    },
    snowflake: {
        // simulate pg client
        client: 'pg',
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
        getConnector: function () {
            return require('snowflake-sdk');
        },
        getConnection: function (configuration, connector) {
            // Always connect trought pool, because snowflake has different interfaces for normal and pool connection
            return connector(configuration.connection.connectionString
                ? configuration.connection.connectionString
                : __assign({}, configuration.connection), configuration.pool || { min: 0, max: 20 });
        },
        execute: function (connection, sql) {
            if (!connection) {
                throw new Error("Provider isn't configured yet, please use #setupProvider() to provide config");
            }
            return connection.use(function (client) {
                return client.execute({
                    sqlText: sql.sql,
                    binds: sql.bindings
                });
            });
        }
    }
};
