"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnexBasedSQLProvider = void 0;
const knex_1 = __importDefault(require("knex"));
class KnexBasedSQLProvider {
    constructor(configuration, connector) {
        this.configuration = configuration;
        this.connector = connector;
    }
    getQueryPromise(query, builder) {
        return builder.select().from(query.table);
    }
    getQueryBuilder() {
        //implement
        return (0, knex_1.default)({ client: 'pg' });
    }
    execute(connection, sql) {
        if (!connection) {
            throw new Error("Provider isn't configured yet, please use #setupProvider() to provide config");
        }
        const native = sql.toSQL().toNative();
        return connection.unsafe(native.sql, native.bindings || []);
    }
    getConnection() {
        let options = {
            max: this.configuration.pool?.max || 20,
        };
        if (!this.configuration.connection.connectionString) {
            options = {
                ...this.configuration.connection,
                ...options,
            };
        }
        const connection = this.configuration.connection.connectionString
            ? this.connector(this.configuration.connection.connectionString, options)
            : this.connector(options);
        return connection;
    }
    disableOperationFor(query, operation) { }
}
exports.KnexBasedSQLProvider = KnexBasedSQLProvider;
