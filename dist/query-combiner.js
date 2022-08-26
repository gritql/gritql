"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.combineQuery = void 0;
const combineQuery = (query, clonedQuery) => {
    // Meta information from metric/dimension
    // We are getting it like this to avoid side-effects of metric
    query.table = clonedQuery.table;
    query.joins = clonedQuery.joins;
    query.advancedFilters = clonedQuery.advancedFilters;
    query.preparedAdvancedFilters = clonedQuery.preparedAdvancedFilters;
    query.search = clonedQuery.search;
    query.getters = clonedQuery.getters;
    query.orderBys = clonedQuery.orderBys;
    query.dimensions = clonedQuery.dimensions;
    query.metrics = clonedQuery.metrics;
    return query;
};
exports.combineQuery = combineQuery;
