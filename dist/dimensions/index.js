"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dimensionResolvers = void 0;
const cross_table_1 = require("../cross-table");
const filters_1 = require("../filters");
const parser_1 = require("../parser");
const query_combiner_1 = require("../query-combiner");
const types_1 = require("../types");
const wrapper_1 = require("./wrapper");
exports.dimensionResolvers = {
    groupBy: (0, wrapper_1.dimensionWrapper)((alias, args, query, knex) => {
        if (args.from !== query.table) {
            query.preparedAdvancedFilters = (0, filters_1.parseAdvancedFilters)(query, knex, query.advancedFilters, true);
        }
        const pre_trunc = (0, filters_1.applyFilters)(query, (0, filters_1.withFilters)(query.filters)(knex
            .select([
            '*',
            knex.raw(`date_trunc(?, ??) as ??`, [
                args.by,
                args.field,
                `${args.field}_${args.by}`,
            ]),
        ])
            .from(args.from || query.table), knex), knex);
        const table = args.alias || args.from || query.table;
        (0, cross_table_1.changeQueryTable)(query, knex, table, true);
        if (!query.replaceWith)
            query.replaceWith = {};
        query.replaceWith[args.field] = {
            value: `${args.field}_${args.by}`,
            index: query.groupIndex,
        };
        return query.promise
            .from(pre_trunc.as(table))
            .select(knex.raw(`?? as ??`, [
            `${args.field}_${args.by}`,
            alias || args.field,
        ]))
            .groupBy(knex.raw(`??`, [`${args.field}_${args.by}`]));
    }, {
        field: types_1.PropTypes.string.isRequired,
        by: types_1.PropTypes.oneOf([
            'microseconds',
            'milliseconds',
            'second',
            'minute',
            'hour',
            'day',
            'week',
            'month',
            'quarter',
            'year',
            'decade',
            'century',
            'millennium',
        ]),
        from: types_1.PropTypes.string,
        alias: types_1.PropTypes.string,
    }, ['DATE_TRUNC', 'GROUP BY']),
    groupByEach: (0, wrapper_1.dimensionWrapper)((alias, args, query, knex) => {
        const amount = parseFloat(args.each);
        query.getters = query.getters || [];
        query.promise = query.promise
            .select(knex.raw(`(CAST(FLOOR(CEIL(??)/??) AS INT)*?? || '-' || CAST(FLOOR(CEIL(??)/??) AS INT)*??+??) AS ??`, [
            (0, filters_1.buildFullName)(args, query, args.field, false),
            amount,
            amount,
            (0, filters_1.buildFullName)(args, query, args.field, false),
            amount,
            amount,
            amount - 1,
            alias || args.field,
        ]), knex.raw(`(CAST(FLOOR(CEIL(??)/??) AS INT)*??) AS ??`, [
            (0, filters_1.buildFullName)(args, query, args.field, false),
            amount,
            amount,
            `groupByEach_min_${alias || args.field}`,
        ]), knex.raw(`(CAST(FLOOR(CEIL(??)/??) AS INT)*??+??) AS ??`, [
            (0, filters_1.buildFullName)(args, query, args.field, false),
            amount,
            amount,
            amount - 1,
            `groupByEach_max_${alias || args.field}`,
        ]))
            .groupBy(knex.raw('CAST(FLOOR(CEIL(??)/??) AS INT)', [
            (0, filters_1.buildFullName)(args, query, args.field, false),
            amount,
        ]));
        query.getters.push(`groupByEach_max_${alias || args.field}`);
        query.getters.push(`groupByEach_min_${alias || args.field}`);
        return query.promise;
    }, {
        field: types_1.PropTypes.string.isRequired,
        from: types_1.PropTypes.string,
        each: types_1.PropTypes.number,
    }, ['CAST', 'FLOOR', 'CEIL', 'GROUP BY']),
    combine: (0, wrapper_1.dimensionWrapper)((_, args, query, knex) => {
        if (!args.fields || !Array.isArray(args.fields))
            throw "Combine function requires 'fields' argument with a list of fields";
        args.fields.forEach((field) => {
            if (typeof field === 'string') {
                const clonedQuery = (0, parser_1.parseDimension)({
                    name: {
                        value: field,
                    },
                }, query, knex);
                query = (0, query_combiner_1.combineQuery)(query, clonedQuery);
                query.promise = clonedQuery.promise;
            }
            else {
                if (!field.name)
                    throw 'Combine by elements must have name';
                const { name, alias, resolver, ...rest } = field;
                const tree = {
                    name: {
                        value: name,
                    },
                    resolver: {
                        value: resolver,
                    },
                };
                if (alias) {
                    tree.alias = {
                        value: alias,
                    };
                }
                tree.arguments = rest;
                const clonedQuery = (0, parser_1.parseDimension)(tree, query, knex);
                query = (0, query_combiner_1.combineQuery)(query, clonedQuery);
                query.promise = clonedQuery.promise;
            }
        });
        return query.promise;
    }, {
        from: types_1.PropTypes.string,
        fields: types_1.PropTypes.arrayOf(types_1.PropTypes.oneOfType([
            types_1.PropTypes.string,
            types_1.PropTypes.shape({
                name: types_1.PropTypes.string.isRequired,
                alias: types_1.PropTypes.string,
                resolver: types_1.PropTypes.string,
            }),
        ])).isRequired,
    }, ['GROUP BY']),
    default: (0, wrapper_1.dimensionWrapper)((alias, args, query, knex, { tree }) => {
        const fullName = (0, filters_1.buildFullName)(args, query, tree.name.value, false);
        return query.promise
            .select(alias ? knex.raw(`?? AS ??`, [fullName, alias]) : fullName)
            .groupBy(fullName);
    }, {
        from: types_1.PropTypes.string,
    }, ['GROUP BY']),
    join: (0, cross_table_1.join)(cross_table_1.JoinType.DEFAULT, cross_table_1.Kind.DIMENSION),
    leftJoin: (0, cross_table_1.join)(cross_table_1.JoinType.LEFT, cross_table_1.Kind.DIMENSION),
    rightJoin: (0, cross_table_1.join)(cross_table_1.JoinType.RIGHT, cross_table_1.Kind.DIMENSION),
    fullJoin: (0, cross_table_1.join)(cross_table_1.JoinType.FULL, cross_table_1.Kind.DIMENSION),
    innerJoin: (0, cross_table_1.join)(cross_table_1.JoinType.INNER, cross_table_1.Kind.DIMENSION),
    leftOuterJoin: (0, cross_table_1.join)(cross_table_1.JoinType.LEFT_OUTER, cross_table_1.Kind.DIMENSION),
    rightOuterJoin: (0, cross_table_1.join)(cross_table_1.JoinType.RIGHT_OUTER, cross_table_1.Kind.DIMENSION),
    fullOuterJoin: (0, cross_table_1.join)(cross_table_1.JoinType.FULL_OUTER, cross_table_1.Kind.DIMENSION),
};
