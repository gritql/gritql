"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dimensionWrapper = void 0;
const arguments_1 = require("../arguments");
const lodash_1 = require("lodash");
const types_1 = require("../types");
const filters_1 = require("../filters");
const query_combiner_1 = require("../query-combiner");
const defaultPropTypes = {
    sort_desc: types_1.PropTypes.string,
    sort_asc: types_1.PropTypes.string,
    limit: types_1.PropTypes.oneOfType([types_1.PropTypes.string, types_1.PropTypes.number]),
    offset: types_1.PropTypes.oneOfType([types_1.PropTypes.string, types_1.PropTypes.number]),
    type: types_1.PropTypes.oneOf(['Array', 'Map']),
};
const dimensionWrapper = (dimension, properties, keywords) => {
    return (tree, query, knex) => {
        if (keywords &&
            !keywords.every((keyword) => query.providers[query.provider].keywords.includes(keyword))) {
            throw new Error(`${query.provider} provider doesn't support ${tree.name.value} dimension`);
        }
        let args = tree.arguments
            ? (0, arguments_1.transformLinkedArgs)((0, arguments_1.argumentsToObject)(tree.arguments), query)
            : null;
        if (properties && !args) {
            throw new Error(`${tree.name.value} dimension requires arguments`);
        }
        if (properties) {
            (0, types_1.checkPropTypes)(properties, args, 'arguments', tree.name.value);
        }
        const { dimensions = [] } = query;
        if (!query.groupIndex)
            query.groupIndex = 0;
        query.groupIndex++;
        const alias = tree.alias?.value;
        const clonedQuery = {
            ...(0, lodash_1.cloneDeep)((0, lodash_1.omit)(query, ['promise'])),
            promise: query.promise.clone(),
        };
        // Isolate metric call for plugin system
        const promise = dimension(alias, args, clonedQuery, knex, { tree });
        if (typeof promise === 'undefined') {
            throw new Error("This metric didn't provide any output, looks like you forgot to return #promise");
        }
        query.promise = promise;
        query = (0, query_combiner_1.combineQuery)(query, clonedQuery);
        if (!!args?.sort_desc)
            query.promise.orderBy((0, filters_1.buildFullName)(args, query, args?.sort_desc), 'desc');
        if (!!args?.sort_asc)
            query.promise.orderBy((0, filters_1.buildFullName)(args, query, args?.sort_asc), 'asc');
        if (!!args?.limit)
            query.promise.limit(args?.limit);
        if (!!args?.offset)
            query.promise.offset(args?.offset);
        dimensions.push(tree.alias?.value || tree.name.value);
        query.dimensions = dimensions;
        return query;
    };
};
exports.dimensionWrapper = dimensionWrapper;
