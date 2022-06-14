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
exports.dimensionWrapper = void 0;
var arguments_1 = require("../arguments");
var lodash_1 = require("lodash");
var types_1 = require("../types");
var filters_1 = require("../filters");
var query_combiner_1 = require("../query-combiner");
var defaultPropTypes = {
    sort_desc: types_1.PropTypes.string,
    sort_asc: types_1.PropTypes.string,
    limit: types_1.PropTypes.oneOfType([types_1.PropTypes.string, types_1.PropTypes.number]),
    offset: types_1.PropTypes.oneOfType([types_1.PropTypes.string, types_1.PropTypes.number]),
    type: types_1.PropTypes.oneOf(['Array', 'Map'])
};
var dimensionWrapper = function (dimension, properties, keywords) {
    return function (tree, query, knex) {
        var _a, _b;
        if (keywords &&
            !keywords.every(function (keyword) {
                return query.providers[query.provider].keywords.includes(keyword);
            })) {
            throw new Error(query.provider + " provider doesn't support " + tree.name.value + " dimension");
        }
        var args = tree.arguments
            ? arguments_1.transformLinkedArgs(arguments_1.argumentsToObject(tree.arguments), query)
            : null;
        if (properties && !args) {
            throw new Error(tree.name.value + " dimension requires arguments");
        }
        if (properties) {
            types_1.checkPropTypes(properties, args, 'arguments', tree.name.value);
        }
        var _c = query.dimensions, dimensions = _c === void 0 ? [] : _c;
        if (!query.groupIndex)
            query.groupIndex = 0;
        query.groupIndex++;
        var alias = (_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value;
        var clonedQuery = __assign(__assign({}, lodash_1.cloneDeep(lodash_1.omit(query, ['promise']))), { promise: query.promise.clone() });
        // Isolate metric call for plugin system
        var promise = dimension(alias, args, clonedQuery, knex, { tree: tree });
        if (typeof promise === 'undefined') {
            throw new Error("This metric didn't provide any output, looks like you forgot to return #promise");
        }
        query.promise = promise;
        query = query_combiner_1.combineQuery(query, clonedQuery);
        if (!!(args === null || args === void 0 ? void 0 : args.sort_desc))
            query.promise.orderBy(filters_1.buildFullName(args, query, args === null || args === void 0 ? void 0 : args.sort_desc), 'desc');
        if (!!(args === null || args === void 0 ? void 0 : args.sort_asc))
            query.promise.orderBy(filters_1.buildFullName(args, query, args === null || args === void 0 ? void 0 : args.sort_asc), 'asc');
        if (!!(args === null || args === void 0 ? void 0 : args.limit))
            query.promise.limit(args === null || args === void 0 ? void 0 : args.limit);
        if (!!(args === null || args === void 0 ? void 0 : args.offset))
            query.promise.offset(args === null || args === void 0 ? void 0 : args.offset);
        dimensions.push(((_b = tree.alias) === null || _b === void 0 ? void 0 : _b.value) || tree.name.value);
        query.dimensions = dimensions;
        return query;
    };
};
exports.dimensionWrapper = dimensionWrapper;
