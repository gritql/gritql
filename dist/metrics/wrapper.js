"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricWrapper = void 0;
const arguments_1 = require("../arguments");
const lodash_1 = require("lodash");
const types_1 = require("../types");
const filters_1 = require("../filters");
const query_combiner_1 = require("../query-combiner");
const defaultPropTypes = {
    sort: types_1.PropTypes.oneOf(['asc', 'desc']),
    limit: types_1.PropTypes.oneOfType([types_1.PropTypes.string, types_1.PropTypes.number]),
    offset: types_1.PropTypes.oneOfType([types_1.PropTypes.string, types_1.PropTypes.number]),
};
const metricWrapper = (metric, properties, keywords, builder) => {
    return (tree, query, knex) => {
        const { metrics = [] } = query;
        query.metrics = metrics;
        if (keywords &&
            !keywords.every((keyword) => query.providers[query.provider].keywords.includes(keyword))) {
            throw new Error(`${query.provider} provider doesn't support ${tree.name.value} metric`);
        }
        if (builder) {
            if (query.providers[query.provider].queryBuilder !== builder) {
                throw new Error(`${query.provider} provider doesn't support ${tree.name.value} metric`);
            }
        }
        let args = tree.arguments ? (0, arguments_1.argumentsToObject)(tree.arguments) : null;
        if (properties && !args) {
            throw new Error(`${tree.name.value} metric requires arguments`);
        }
        if (properties) {
            (0, types_1.checkPropTypes)(properties, args, 'arguments', tree.name.value);
        }
        const alias = tree.alias?.value;
        const clonedQuery = {
            ...(0, lodash_1.cloneDeep)((0, lodash_1.omit)(query, ['promise'])),
            promise: query.promise.clone(),
        };
        // Isolate metric call for plugin system
        const promise = metric(alias, args, clonedQuery, knex, { tree });
        if (typeof promise === 'undefined') {
            throw new Error("This metric didn't provide any output, looks like you forgot to return #promise");
        }
        query.promise = promise;
        query = (0, query_combiner_1.combineQuery)(query, clonedQuery);
        if (query.providers[query.provider].queryBuilder === 'knex') {
            if (args?.sort == 'desc' || args?.sort == 'asc')
                query.promise.orderBy((0, filters_1.buildFullName)(args, query, tree.name.value), args.sort);
            if (args?.limit)
                query.promise.limit(args.limit);
            if (args?.offset)
                query.promise.offset(args.offset);
        }
        else {
            if (args?.sort === 'desc')
                query.orderBys = (query.orderBys || []).concat(`-${tree.alias?.value || tree.name.value}`);
            if (args?.sort === 'asc')
                query.orderBys = (query.orderBys || []).concat(tree.alias?.value || tree.name.value);
        }
        // Getters are needed only for additionaly selected fields by some specific functions
        // example: price(groupByEach: 50) -> price: 0-50 -> groupByEach_min_price: 0 -> groupByEach_max_price: 50
        // would be useful for further grouping && filtering
        const isInGetters = query.getters?.find((name) => name === tree.name?.value);
        query.metrics.push(isInGetters ? tree.name?.value : tree.alias?.value || tree.name?.value);
    };
};
exports.metricWrapper = metricWrapper;
