"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresProvider = void 0;
const knex_1 = __importDefault(require("knex"));
const KnexBasedSQLProvider_1 = require("./KnexBasedSQLProvider");
class PostgresProvider extends KnexBasedSQLProvider_1.KnexBasedSQLProvider {
    constructor(configuration, connector) {
        super(configuration, connector || require('postgres'));
    }
    getQueryBuilder() {
        return (0, knex_1.default)({ client: 'pg' });
    }
}
exports.PostgresProvider = PostgresProvider;
