"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricResolvers = exports.getOverClosure = exports.partitionBy = exports.partitionByTypes = void 0;
const cross_table_1 = require("../cross-table");
const filters_1 = require("../filters");
const types_1 = require("../types");
const wrapper_1 = require("./wrapper");
exports.partitionByTypes = {
    by: types_1.PropTypes.oneOfType([types_1.PropTypes.string, types_1.PropTypes.arrayOf(types_1.PropTypes.string)]),
};
function partitionBy(args, query, knex) {
    let partition;
    if (!!args.by) {
        let partitionBy = Array.isArray(args.by) ? args.by.map((by) => (0, filters_1.buildFullName)(args, query, by, false)).join(',') : (0, filters_1.buildFullName)(args, query, args.by, false);
        if (query.replaceWith?.[args.by]) {
            partitionBy = query.replaceWith[args.by].value;
        }
        partition = knex.raw(`PARTITION BY ??`, [partitionBy]);
    }
    return partition || '';
}
exports.partitionBy = partitionBy;
function optionalPart(checker, stmt) {
    return checker ? ` ${stmt}` : '';
}
function getOverClosure(args, query, knex, options) {
    const partition = partitionBy(args, query, knex);
    const isAnyValidOptionAvailable = options && options.orderBy;
    if (!isAnyValidOptionAvailable && !partition) {
        return 'OVER()';
    }
    return knex.raw(`OVER(${partition}${options?.orderBy
        ? knex.raw(`ORDER BY ?? ${options.orderBy.dir || 'DESC'}`, [
            options.orderBy.by,
        ])
        : ''})${options?.cast ? `::${options.cast}` : ''}`);
}
exports.getOverClosure = getOverClosure;
exports.metricResolvers = {
    percentile: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        return query.promise.select(knex.raw(`PERCENTILE_CONT(??) WITHIN GROUP(ORDER BY ??) AS ??`, [
            parseFloat(args.factor) || 0.5,
            (0, filters_1.buildFullName)(args, query, args.a, false),
            alias,
        ]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        factor: types_1.PropTypes.number,
    }, ['PERCENTILE_CONT', 'WITHIN GROUP'], 'knex'),
    median: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        return query.promise.select(knex.raw(`MEDIAN(??) ${getOverClosure(args, query, knex)} AS ??`, [
            args.a,
            alias,
        ]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        ...exports.partitionByTypes
    }, ['MEDIAN', 'PARTITION BY', 'ORDER BY'], 'knex'),
    sum: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        return query.promise.select(knex.raw(`SUM(??)${optionalPart(!!args.by, getOverClosure(args, query, knex))} AS ??`, [(0, filters_1.buildFullName)(args, query, args.a, false), alias]));
    }, {
        a: types_1.PropTypes.string,
        ...exports.partitionByTypes
    }, ['SUM'], 'knex'),
    min: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        return query.promise.select(knex.raw(`MIN(??)${optionalPart(!!args.by, getOverClosure(args, query, knex))} AS ??`, [(0, filters_1.buildFullName)(args, query, args.a, false), alias]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        ...exports.partitionByTypes
    }, ['MIN'], 'knex'),
    max: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        return query.promise.select(knex.raw(`MAX(??)${optionalPart(!!args.by, getOverClosure(args, query, knex))} AS ??`, [(0, filters_1.buildFullName)(args, query, args.a, false), alias]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        ...exports.partitionByTypes
    }, ['MAX'], 'knex'),
    count: (0, wrapper_1.metricWrapper)((alias, args, query) => {
        return query.promise.count(args.a
            ? `${(0, filters_1.buildFullName)(args, query, args.a, false)} as ${alias}`
            : '1');
    }, {
        a: types_1.PropTypes.string,
    }, ['COUNT'], 'knex'),
    countDistinct: (0, wrapper_1.metricWrapper)((alias, args, query) => {
        return query.promise.countDistinct(`${(0, filters_1.buildFullName)(args, query, args.a, false)} as ${alias}`);
    }, {
        a: types_1.PropTypes.string.isRequired,
    }, ['COUNT', 'DISTINCT'], 'knex'),
    join: (0, cross_table_1.join)(cross_table_1.JoinType.DEFAULT),
    leftJoin: (0, cross_table_1.join)(cross_table_1.JoinType.LEFT),
    rightJoin: (0, cross_table_1.join)(cross_table_1.JoinType.RIGHT),
    fullJoin: (0, cross_table_1.join)(cross_table_1.JoinType.FULL),
    innerJoin: (0, cross_table_1.join)(cross_table_1.JoinType.INNER),
    leftOuterJoin: (0, cross_table_1.join)(cross_table_1.JoinType.LEFT_OUTER),
    rightOuterJoin: (0, cross_table_1.join)(cross_table_1.JoinType.RIGHT_OUTER),
    fullOuterJoin: (0, cross_table_1.join)(cross_table_1.JoinType.FULL_OUTER),
    ranking: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        let alg = 'DENSE_RANK';
        if (args.alg === 'denseRank') {
            alg = 'DENSE_RANK';
        }
        else if (args.alg === 'rank') {
            alg = 'RANK';
        }
        else if (args.alg === 'rowNumber') {
            alg = 'ROW_NUMBER';
        }
        const promise = (0, filters_1.applyFilters)(query, (0, filters_1.withFilters)(query, query.filters)(knex
            .select('*')
            .select(knex.raw(`${alg}() ${getOverClosure(args, query, knex, {
            orderBy: { by: (0, filters_1.buildFullName)(args, query, args.a, false) },
        })} as ??`, [alias]))
            .from(query.table || args.from), knex), knex);
        const table = args.tableAlias || args.from || query.table;
        const finalPromise = query.promise
            .select((0, filters_1.buildFullName)({ from: table }, query, alias, false))
            .from(promise.as(args.tableAlias || query.table));
        (0, cross_table_1.changeQueryTable)(query, knex, table, true);
        finalPromise.groupBy((0, filters_1.buildFullName)({ from: table }, query, alias, false));
        return finalPromise;
    }, {
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string,
        alg: types_1.PropTypes.oneOf(['denseRank', 'rank', 'rowNumber']),
        tableAlias: types_1.PropTypes.string,
    }, ['DENSE_RANK', 'RANK', 'ROW_NUMBER', 'OVER', 'PARTITION BY'], 'knex'),
    searchRanking: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        const key = (0, filters_1.buildFullName)({ from: args.from || query.table }, query, args.a, false);
        if (!query.search[key])
            throw `SearchRanking requires search query for ${key} field`;
        return query.promise.select(knex.raw("ts_rank(to_tsvector('simple', ??), (plainto_tsquery('simple', ?)::text || ':*')::tsquery) as ??", [key, query.search[key], alias]));
    }, { a: types_1.PropTypes.string.isRequired }, ['PLAINTO_TSQUERY', 'TO_TSVECTOR', 'TS_RANK'], 'knex'),
    searchHeadline: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        const key = (0, filters_1.buildFullName)({ from: args.from || query.table }, query, args.a, false);
        if (!query.search[key])
            throw `SearchHeadline requires search query for ${key} field`;
        return query.promise.select(knex.raw("ts_headline('simple', ??, (plainto_tsquery('simple', ?)::text || ':*')::tsquery) as ??", [key, query.search[key], alias]));
    }, {
        a: types_1.PropTypes.string.isRequired,
    }, ['PLAINTO_TSQUERY', 'TS_HEADLINE'], 'knex'),
    unique: (0, wrapper_1.metricWrapper)((alias, args, query) => {
        const field = (0, filters_1.buildFullName)(args, query, args?.a || alias, false);
        return query.promise.select(`${field} as ${alias}`).groupBy(field);
    }, {
        a: types_1.PropTypes.string,
    }, ['GROUP BY'], 'knex'),
    from: (0, wrapper_1.metricWrapper)((alias, args, query) => {
        const field = (0, filters_1.buildFullName)(args, query, args?.a || alias, false);
        return query.promise.select(`${field} as ${alias}`);
    }, {
        a: types_1.PropTypes.string,
        from: types_1.PropTypes.string.isRequired,
    }, [], 'knex'),
    avg: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        return query.promise.select(knex.raw(`avg(??) ${getOverClosure(args, query, knex, {
            cast: 'float4',
        })} as ??`, [(0, filters_1.buildFullName)(args, query, args.a, false), alias]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string,
    }, ['AVG', 'PARTITION BY'], 'knex'),
    avgPerDimension: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        return query.promise.select(knex.raw(`sum(??)::float/COUNT(DISTINCT ??)::float4 as ??`, [
            (0, filters_1.buildFullName)(args, query, args.a, false),
            (0, filters_1.buildFullName)(args, query, args.per, false),
            alias,
        ]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        per: types_1.PropTypes.string.isRequired,
    }, ['SUM', 'COUNT', 'DISTINCT'], 'knex'),
    share: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        return query.promise.select(knex.raw(`sum(??)/NULLIF(sum(sum(??)) ${getOverClosure(args, query, knex)}, 0)::float4 as ??`, [
            (0, filters_1.buildFullName)(args, query, args.a, false),
            (0, filters_1.buildFullName)(args, query, args.a, false),
            alias,
        ]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string,
    }, ['SUM', 'NULLIF', 'OVER', 'PARTITION BY'], 'knex'),
    indexed: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        return query.promise.select(knex.raw(`sum(??)/NULLIF(max(sum(??)::float) ${getOverClosure(args, query, knex)}, 0)::float4 as ??`, [
            (0, filters_1.buildFullName)(args, query, args.a, false),
            (0, filters_1.buildFullName)(args, query, args.a, false),
            alias,
        ]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string,
    }, ['MAX', 'SUM', 'NULLIF', 'OVER', 'PARTITION BY'], 'knex'),
    divide: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        const functions = Object.keys(args).reduce((r, k) => {
            const fns = args[k].split('|');
            if (fns.length === 2) {
                args[k] = fns[1];
                r[k] = fns[0];
            }
            return r;
        }, { a: 'sum', by: 'sum' });
        return query.promise.select(knex.raw(`cast(??(??) as float)/NULLIF(cast(??(??) as float), 0)::float4 as ??`, [
            functions.a,
            (0, filters_1.buildFullName)(args, query, args.a, false),
            functions.by,
            (0, filters_1.buildFullName)(args, query, args.by, false),
            alias,
        ]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string.isRequired,
    }, ['CAST', 'NULLIF'], 'knex'),
    multiply: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        const functions = Object.keys(args).reduce((r, k) => {
            if (typeof args[k] !== 'string')
                return r;
            const fns = args[k].split('|');
            if (fns.length === 2) {
                args[k] = fns[1];
                r[k] = fns[0];
            }
            return r;
        }, { a: 'sum', by: 'sum' });
        let bySql = {
            query: `cast(??(??) as float)`,
            variables: [functions.by, (0, filters_1.buildFullName)(args, query, args.by, false)],
        };
        //if type of args by is number
        if (typeof args.by === 'number') {
            bySql = {
                query: `?`,
                variables: [`${args.by}`],
            };
        }
        return query.promise.select(knex.raw(`cast(??(??) as float)*${bySql.query}::float4 as ??`, [
            functions.a,
            (0, filters_1.buildFullName)(args, query, args.a, false),
            ...bySql.variables,
            alias,
        ]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.oneOfType([types_1.PropTypes.string, types_1.PropTypes.number]).isRequired,
    }, ['CAST', 'NULLIF'], 'knex'),
    aggrAverage: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        let internal = query.promise
            .select((0, filters_1.buildFullName)(args, query, alias, false))
            .sum(`${(0, filters_1.buildFullName)(args, query, args.to, false)} as ${args.to}`)
            .sum(`${(0, filters_1.buildFullName)(args, query, args.by, false)} as ${args.by}`)
            .select(knex.raw(`?? * sum(??) as "aggrAverage"`, [
            (0, filters_1.buildFullName)(args, query, alias, false),
            (0, filters_1.buildFullName)(args, query, args.to, false),
        ]))
            .groupBy((0, filters_1.buildFullName)(args, query, alias, false));
        if (args.to !== args.by)
            internal = internal.sum(`${(0, filters_1.buildFullName)(args, query, args.by, false)} as ${args.by}`);
        let promise = knex
            .select(query.dimensions)
            .select(knex.raw(`sum("aggrAverage")/max(??)::float4  as "${alias}_aggrAverage"`, [(0, filters_1.buildFullName)(args, query, args.by, false)]))
            .from(internal.as('middleTable'));
        if (!!query.dimensions && query.dimensions.length > 0) {
            promise = promise.groupBy(query.dimensions);
        }
        return promise;
    }, {
        to: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string.isRequired,
    }, ['SUM', 'MAX', 'GROUP BY'], 'knex'),
    weightAvg: (0, wrapper_1.metricWrapper)((alias, args, query, knex) => {
        let internal = query.promise
            .select((0, filters_1.buildFullName)(args, query, args.a, false))
            .sum(`${(0, filters_1.buildFullName)(args, query, args.by, false)} as ${args.by}`)
            .select(knex.raw(`?? * sum(??)::float4 as "weightAvg"`, [
            (0, filters_1.buildFullName)(args, query, args.a, false),
            (0, filters_1.buildFullName)(args, query, args.by, false),
        ]))
            .groupBy((0, filters_1.buildFullName)(args, query, args.a, false));
        let promise = knex
            .select(query.dimensions)
            .select(knex.raw(`sum("weightAvg")/sum(??)::float4 as "${alias}"`, [
            (0, filters_1.buildFullName)(args, query, args.by, false),
        ]))
            .from(internal.as('middleTable'));
        if (!!query.dimensions && query.dimensions.length > 0) {
            promise = promise.groupBy(query.dimensions);
        }
    }, {
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string.isRequired,
    }, ['SUM', 'GROUP BY'], 'knex'),
    distinct: (0, wrapper_1.metricWrapper)((alias, args, query) => {
        return query.promise.distinct((0, filters_1.buildFullName)(args, query, alias, false));
    }, {}, ['DISTINCT'], 'knex'),
    default: (0, wrapper_1.metricWrapper)((alias, args, query, _, { tree }) => {
        // Getters are needed only for additionaly selected fields by some specific functions
        // example: price(groupByEach: 50) -> price: 0-50 -> groupByEach_min_price: 0 -> groupByEach_max_price: 50
        // would be useful for further grouping && filtering
        const isInGetters = query.getters?.find((name) => name === tree.name.value);
        if (!isInGetters) {
            if (query.provider === 'ga') {
                if (alias) {
                    throw new Error('Aliases for metrics are not supported by GA provider');
                }
            }
            else {
                if (!alias) {
                    return query.promise.select(`${(0, filters_1.buildFullName)(args, query, tree.name.value)}`);
                }
                else {
                    return query.promise.select(`${(0, filters_1.buildFullName)(args, query, tree.name.value)} as ${alias}`);
                }
            }
        }
        return query.promise;
    }),
};
