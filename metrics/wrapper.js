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
exports.metricWrapper = void 0;
var arguments_1 = require("../arguments");
var lodash_1 = require("lodash");
var types_1 = require("../types");
var filters_1 = require("../filters");
var query_combiner_1 = require("../query-combiner");
var defaultPropTypes = {
    sort: types_1.PropTypes.oneOf(['asc', 'desc']),
    limit: types_1.PropTypes.oneOfType([types_1.PropTypes.string, types_1.PropTypes.number]),
    offset: types_1.PropTypes.oneOfType([types_1.PropTypes.string, types_1.PropTypes.number])
};
var metricWrapper = function (metric, properties, keywords) {
    return function (tree, query, knex) {
        var _a, _b, _c, _d, _e;
        var _f = query.metrics, metrics = _f === void 0 ? [] : _f;
        query.metrics = metrics;
        if (keywords &&
            !keywords.every(function (keyword) {
                return query.providers[query.provider].keywords.includes(keyword);
            })) {
            throw new Error(query.provider + " provider doesn't support " + tree.name.value + " metric");
        }
        var args = tree.arguments ? arguments_1.argumentsToObject(tree.arguments) : null;
        if (properties && !args) {
            throw new Error(tree.name.value + " metric requires arguments");
        }
        if (properties) {
            types_1.checkPropTypes(properties, args, 'arguments', tree.name.value);
        }
        var alias = (_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value;
        var clonedQuery = __assign(__assign({}, lodash_1.cloneDeep(lodash_1.omit(query, ['promise']))), { promise: query.promise.clone() });
        // Isolate metric call for plugin system
        var promise = metric(alias, args, clonedQuery, knex, { tree: tree });
        if (typeof promise === 'undefined') {
            throw new Error("This metric didn't provide any output, looks like you forgot to return #promise");
        }
        query.promise = promise;
        query = query_combiner_1.combineQuery(query, clonedQuery);
        if ((args === null || args === void 0 ? void 0 : args.sort) == 'desc' || (args === null || args === void 0 ? void 0 : args.sort) == 'asc')
            query.promise.orderBy(filters_1.buildFullName(args, query, tree.name.value), args.sort);
        if (args === null || args === void 0 ? void 0 : args.limit)
            query.promise.limit(args.limit);
        if (args === null || args === void 0 ? void 0 : args.offset)
            query.promise.offset(args.offset);
        // Getters are needed only for additionaly selected fields by some specific functions
        // example: price(groupByEach: 50) -> price: 0-50 -> groupByEach_min_price: 0 -> groupByEach_max_price: 50
        // would be useful for further grouping && filtering
        var isInGetters = (_b = query.getters) === null || _b === void 0 ? void 0 : _b.find(function (name) { var _a; return name === ((_a = tree.name) === null || _a === void 0 ? void 0 : _a.value); });
        query.metrics.push(isInGetters ? (_c = tree.name) === null || _c === void 0 ? void 0 : _c.value : ((_d = tree.alias) === null || _d === void 0 ? void 0 : _d.value) || ((_e = tree.name) === null || _e === void 0 ? void 0 : _e.value));
    };
};
exports.metricWrapper = metricWrapper;
