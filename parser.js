"use strict";
exports.__esModule = true;
exports.parseFilters = exports.parseDimension = exports.parseMetric = void 0;
var filters_1 = require("./filters");
function parseMetric(tree, query, knex) {
    var _a, _b;
    if (query.metricResolvers[(_a = tree.name) === null || _a === void 0 ? void 0 : _a.value])
        return query.metricResolvers[(_b = tree.name) === null || _b === void 0 ? void 0 : _b.value](tree, query, knex);
    else
        return query.metricResolvers["default"](tree, query, knex);
}
exports.parseMetric = parseMetric;
function parseDimension(tree, query, knex) {
    var _a, _b;
    if (query.dimensionResolvers[(_a = tree.name) === null || _a === void 0 ? void 0 : _a.value])
        return query.dimensionResolvers[(_b = tree.name) === null || _b === void 0 ? void 0 : _b.value](tree, query, knex);
    else
        return query.dimensionResolvers["default"](tree, query, knex);
}
exports.parseDimension = parseDimension;
function parseFilters(tree, query, knex) {
    var args = tree.arguments;
    return filters_1.transformFilters(args.concat({ name: { value: 'from' }, value: { value: query.table } }), query, knex);
}
exports.parseFilters = parseFilters;
