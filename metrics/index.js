"use strict";
exports.__esModule = true;
exports.metricResolvers = void 0;
var cross_table_1 = require("../cross-table");
var filters_1 = require("../filters");
var types_1 = require("../types");
var wrapper_1 = require("./wrapper");
exports.metricResolvers = {
    percentile: wrapper_1.metricWrapper(function (alias, args, query, knex) {
        return query.promise.select(knex.raw("PERCENTILE_CONT(??) WITHIN GROUP(ORDER BY ??) AS ??", [
            parseFloat(args.factor) || 0.5,
            filters_1.buildFullName(args, query, args.a, false),
            alias,
        ]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        factor: types_1.PropTypes.number,
        from: types_1.PropTypes.string
    }, ['PERCENTILE_CONT', 'WITHIN GROUP']),
    median: wrapper_1.metricWrapper(function (alias, args, query, knex) {
        var _a;
        var partition;
        if (!!args.by) {
            var partitionBy = filters_1.buildFullName(args, query, args.by, false);
            if ((_a = query.replaceWith) === null || _a === void 0 ? void 0 : _a[args.by]) {
                partitionBy = query.replaceWith[args.by].value;
            }
            partition = knex.raw("PARTITION BY ??", [partitionBy]);
        }
        return query.promise.select(knex.raw("MEDIAN(??) OVER (" + (partition || '') + ") AS ??", [args.a, alias]));
    }, {
        from: types_1.PropTypes.string,
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string
    }, ['MEDIAN', 'PARTITION BY', 'ORDER BY']),
    sum: wrapper_1.metricWrapper(function (alias, args, query) {
        return query.promise.sum(filters_1.buildFullName(args, query, args.a, false) + " as " + alias);
    }, {
        a: types_1.PropTypes.string,
        from: types_1.PropTypes.string
    }, ['SUM']),
    min: wrapper_1.metricWrapper(function (alias, args, query) {
        return query.promise.min(filters_1.buildFullName(args, query, args.a, false) + " as " + alias);
    }, {
        a: types_1.PropTypes.string.isRequired,
        from: types_1.PropTypes.string
    }, ['MIN']),
    max: wrapper_1.metricWrapper(function (alias, args, query) {
        return query.promise.max(filters_1.buildFullName(args, query, args.a, false) + " as " + alias);
    }, {
        a: types_1.PropTypes.string.isRequired,
        from: types_1.PropTypes.string
    }, ['MAX']),
    count: wrapper_1.metricWrapper(function (alias, args, query) {
        return query.promise.count(args.a
            ? filters_1.buildFullName(args, query, args.a, false) + " as " + alias
            : '1');
    }, {
        a: types_1.PropTypes.string,
        from: types_1.PropTypes.string
    }, ['COUNT']),
    countDistinct: wrapper_1.metricWrapper(function (alias, args, query) {
        return query.promise.countDistinct(filters_1.buildFullName(args, query, args.a, false) + " as " + alias);
    }, {
        a: types_1.PropTypes.string.isRequired,
        from: types_1.PropTypes.string
    }, ['COUNT', 'DISTINCT']),
    join: cross_table_1.join(cross_table_1.JoinType.DEFAULT),
    leftJoin: cross_table_1.join(cross_table_1.JoinType.LEFT),
    rightJoin: cross_table_1.join(cross_table_1.JoinType.RIGHT),
    fullJoin: cross_table_1.join(cross_table_1.JoinType.FULL),
    innerJoin: cross_table_1.join(cross_table_1.JoinType.INNER),
    leftOuterJoin: cross_table_1.join(cross_table_1.JoinType.LEFT_OUTER),
    rightOuterJoin: cross_table_1.join(cross_table_1.JoinType.RIGHT_OUTER),
    fullOuterJoin: cross_table_1.join(cross_table_1.JoinType.FULL_OUTER),
    ranking: wrapper_1.metricWrapper(function (alias, args, query, knex) {
        var _a;
        var partition;
        if (!!args.by) {
            var partitionBy = filters_1.buildFullName(args, query, args.by, false);
            if ((_a = query.replaceWith) === null || _a === void 0 ? void 0 : _a[args.by]) {
                partitionBy = query.replaceWith[args.by].value;
            }
            partition = knex.raw("partition by ??", [partitionBy]);
        }
        var alg = 'DENSE_RANK';
        if (args.alg === 'denseRank') {
            alg = 'DENSE_RANK';
        }
        else if (args.alg === 'rank') {
            alg = 'RANK';
        }
        else if (args.alg === 'rowNumber') {
            alg = 'ROW_NUMBER';
        }
        var promise = filters_1.applyFilters(query, filters_1.withFilters(query.filters)(knex
            .select('*')
            .select(knex.raw(alg + "() over (" + (partition || '') + " ORDER BY ?? desc) as ??", [filters_1.buildFullName(args, query, args.a, false), alias]))
            .from(query.table || args.from)), knex);
        var table = args.tableAlias || args.from || query.table;
        var finalPromise = query.promise
            .select(filters_1.buildFullName({ from: table }, query, alias, false))
            .from(promise.as(args.tableAlias || query.table));
        cross_table_1.changeQueryTable(query, knex, table, true);
        finalPromise.groupBy(filters_1.buildFullName({ from: table }, query, alias, false));
        return finalPromise;
    }, {
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string,
        alg: types_1.PropTypes.oneOf(['denseRank', 'rank', 'rowNumber']),
        from: types_1.PropTypes.string,
        tableAlias: types_1.PropTypes.string
    }, ['DENSE_RANK', 'RANK', 'ROW_NUMBER', 'OVER', 'PARTITION BY']),
    searchRanking: wrapper_1.metricWrapper(function (alias, args, query, knex) {
        var key = filters_1.buildFullName({ from: args.from || query.table }, query, args.a, false);
        if (!query.search[key])
            throw "SearchRanking requires search query for " + key + " field";
        return query.promise.select(knex.raw("ts_rank(to_tsvector('simple', ??), (plainto_tsquery('simple', ?)::text || ':*')::tsquery) as ??", [key, query.search[key], alias]));
    }, { a: types_1.PropTypes.string.isRequired, from: types_1.PropTypes.string }, ['PLAINTO_TSQUERY', 'TO_TSVECTOR', 'TS_RANK']),
    searchHeadline: wrapper_1.metricWrapper(function (alias, args, query, knex) {
        var key = filters_1.buildFullName({ from: args.from || query.table }, query, args.a, false);
        if (!query.search[key])
            throw "SearchHeadline requires search query for " + key + " field";
        return query.promise.select(knex.raw("ts_headline('simple', ??, (plainto_tsquery('simple', ?)::text || ':*')::tsquery) as ??", [key, query.search[key], alias]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        from: types_1.PropTypes.string
    }, ['PLAINTO_TSQUERY', 'TS_HEADLINE']),
    unique: wrapper_1.metricWrapper(function (alias, args, query) {
        var field = filters_1.buildFullName(args, query, (args === null || args === void 0 ? void 0 : args.a) || alias, false);
        return query.promise.select(field + " as " + alias).groupBy(field);
    }, {
        a: types_1.PropTypes.string,
        from: types_1.PropTypes.string
    }, ['GROUP BY']),
    from: wrapper_1.metricWrapper(function (alias, args, query) {
        var field = filters_1.buildFullName(args, query, (args === null || args === void 0 ? void 0 : args.a) || alias, false);
        return query.promise.select(field + " as " + alias);
    }, {
        a: types_1.PropTypes.string,
        from: types_1.PropTypes.string.isRequired
    }, []),
    avg: wrapper_1.metricWrapper(function (alias, args, query, knex) {
        //TODO: test
        if (!!args.by) {
            return query.promise.select(knex.raw("avg(??) over (partition by ??)::float4 as ??", [
                filters_1.buildFullName(args, query, args.a, false),
                filters_1.buildFullName(args, query, args.by, false),
                alias,
            ]));
        }
        else {
            return query.promise.avg(filters_1.buildFullName(args, query, args.a, false) + " as " + alias);
        }
    }, {
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string,
        from: types_1.PropTypes.string
    }, ['AVG', 'PARTITION BY']),
    avgPerDimension: wrapper_1.metricWrapper(function (alias, args, query, knex) {
        return query.promise.select(knex.raw("sum(??)::float/COUNT(DISTINCT ??)::float4 as ??", [
            filters_1.buildFullName(args, query, args.a, false),
            filters_1.buildFullName(args, query, args.per, false),
            alias,
        ]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        per: types_1.PropTypes.string.isRequired,
        from: types_1.PropTypes.string
    }, ['SUM', 'COUNT', 'DISTINCT']),
    share: wrapper_1.metricWrapper(function (alias, args, query, knex) {
        var _a;
        var partition;
        if (!!args.by) {
            var partitionBy = filters_1.buildFullName(args, query, args.by, false);
            if ((_a = query.replaceWith) === null || _a === void 0 ? void 0 : _a[args.by]) {
                partitionBy = query.replaceWith[args.by].value;
            }
            partition = knex.raw("partition by ??", [partitionBy]);
        }
        return query.promise.select(knex.raw("sum(??)/NULLIF(sum(sum(??)) over (" + (partition || '') + "), 0)::float4 as ??", [
            filters_1.buildFullName(args, query, args.a, false),
            filters_1.buildFullName(args, query, args.a, false),
            alias,
        ]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string,
        from: types_1.PropTypes.string
    }, ['SUM', 'NULLIF', 'OVER', 'PARTITION BY']),
    indexed: wrapper_1.metricWrapper(function (alias, args, query, knex) {
        var partition;
        if (!!args.by)
            partition = knex.raw("partition by ??", [
                filters_1.buildFullName(args, query, args.by, false),
            ]);
        return query.promise.select(knex.raw("sum(??)/NULLIF(max(sum(??)::float) over (" + (partition || '') + "), 0)::float4 as ??", [
            filters_1.buildFullName(args, query, args.a, false),
            filters_1.buildFullName(args, query, args.a, false),
            alias,
        ]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string,
        from: types_1.PropTypes.string
    }, ['MAX', 'SUM', 'NULLIF', 'OVER', 'PARTITION BY']),
    divide: wrapper_1.metricWrapper(function (alias, args, query, knex) {
        var functions = Object.keys(args).reduce(function (r, k) {
            var fns = args[k].split('|');
            if (fns.length === 2) {
                args[k] = fns[1];
                r[k] = fns[0];
            }
            return r;
        }, { a: 'sum', by: 'sum' });
        return query.promise.select(knex.raw("cast(??(??) as float)/NULLIF(cast(??(??) as float), 0)::float4 as ??", [
            functions.a,
            filters_1.buildFullName(args, query, args.a, false),
            functions.by,
            filters_1.buildFullName(args, query, args.by, false),
            alias,
        ]));
    }, {
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string.isRequired,
        from: types_1.PropTypes.string
    }, ['CAST', 'NULLIF']),
    aggrAverage: wrapper_1.metricWrapper(function (alias, args, query, knex) {
        var internal = query.promise
            .select(filters_1.buildFullName(args, query, alias, false))
            .sum(filters_1.buildFullName(args, query, args.to, false) + " as " + args.to)
            .sum(filters_1.buildFullName(args, query, args.by, false) + " as " + args.by)
            .select(knex.raw("?? * sum(??) as \"aggrAverage\"", [
            filters_1.buildFullName(args, query, alias, false),
            filters_1.buildFullName(args, query, args.to, false),
        ]))
            .groupBy(filters_1.buildFullName(args, query, alias, false));
        if (args.to !== args.by)
            internal = internal.sum(filters_1.buildFullName(args, query, args.by, false) + " as " + args.by);
        var promise = knex
            .select(query.dimensions)
            .select(knex.raw("sum(\"aggrAverage\")/max(??)::float4  as \"" + alias + "_aggrAverage\"", [filters_1.buildFullName(args, query, args.by, false)]))
            .from(internal.as('middleTable'));
        if (!!query.dimensions && query.dimensions.length > 0) {
            promise = promise.groupBy(query.dimensions);
        }
        return promise;
    }, {
        to: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string.isRequired,
        from: types_1.PropTypes.string
    }, ['SUM', 'MAX', 'GROUP BY']),
    weightAvg: wrapper_1.metricWrapper(function (alias, args, query, knex) {
        var internal = query.promise
            .select(filters_1.buildFullName(args, query, args.a, false))
            .sum(filters_1.buildFullName(args, query, args.by, false) + " as " + args.by)
            .select(knex.raw("?? * sum(??)::float4 as \"weightAvg\"", [
            filters_1.buildFullName(args, query, args.a, false),
            filters_1.buildFullName(args, query, args.by, false),
        ]))
            .groupBy(filters_1.buildFullName(args, query, args.a, false));
        var promise = knex
            .select(query.dimensions)
            .select(knex.raw("sum(\"weightAvg\")/sum(??)::float4 as \"" + alias + "\"", [
            filters_1.buildFullName(args, query, args.by, false),
        ]))
            .from(internal.as('middleTable'));
        if (!!query.dimensions && query.dimensions.length > 0) {
            promise = promise.groupBy(query.dimensions);
        }
    }, {
        a: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.string.isRequired,
        from: types_1.PropTypes.string
    }, ['SUM', 'GROUP BY']),
    distinct: wrapper_1.metricWrapper(function (alias, args, query) {
        return query.promise.distinct(filters_1.buildFullName(args, query, alias, false));
    }, {
        from: types_1.PropTypes.string
    }, ['DISTINCT']),
    "default": wrapper_1.metricWrapper(function (alias, args, query, _, _a) {
        var _b;
        var tree = _a.tree;
        // Getters are needed only for additionaly selected fields by some specific functions
        // example: price(groupByEach: 50) -> price: 0-50 -> groupByEach_min_price: 0 -> groupByEach_max_price: 50
        // would be useful for further grouping && filtering
        var isInGetters = (_b = query.getters) === null || _b === void 0 ? void 0 : _b.find(function (name) { return name === tree.name.value; });
        if (!isInGetters) {
            if (!alias) {
                return query.promise.select("" + filters_1.buildFullName(args, query, tree.name.value));
            }
            else {
                return query.promise.select(filters_1.buildFullName(args, query, tree.name.value) + " as " + alias);
            }
        }
        return query.promise;
    })
};
