"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
exports.__esModule = true;
exports.dimensionResolvers = void 0;
var cross_table_1 = require("../cross-table");
var filters_1 = require("../filters");
var parser_1 = require("../parser");
var query_combiner_1 = require("../query-combiner");
var types_1 = require("../types");
var wrapper_1 = require("./wrapper");
exports.dimensionResolvers = {
    groupBy: wrapper_1.dimensionWrapper(function (alias, args, query, knex) {
        if (args.from !== query.table) {
            query.preparedAdvancedFilters = filters_1.parseAdvancedFilters(query, knex, query.advancedFilters, true);
        }
        var pre_trunc = filters_1.applyFilters(query, filters_1.withFilters(query.filters)(knex
            .select([
            '*',
            knex.raw("date_trunc(?, ??) as ??", [
                args.by,
                args.field,
                args.field + "_" + args.by,
            ]),
        ])
            .from(args.from || query.table)), knex);
        var table = args.alias || args.from || query.table;
        cross_table_1.changeQueryTable(query, knex, table, true);
        if (!query.replaceWith)
            query.replaceWith = {};
        query.replaceWith[args.field] = {
            value: args.field + "_" + args.by,
            index: query.groupIndex
        };
        return query.promise
            .from(pre_trunc.as(table))
            .select(knex.raw("?? as ??", [
            args.field + "_" + args.by,
            alias || args.field,
        ]))
            .groupBy(knex.raw("??", [args.field + "_" + args.by]));
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
        alias: types_1.PropTypes.string
    }, ['DATE_TRUNC', 'GROUP BY']),
    groupByEach: wrapper_1.dimensionWrapper(function (alias, args, query, knex) {
        var amount = parseFloat(args.each);
        query.getters = query.getters || [];
        query.promise = query.promise
            .select(knex.raw("(CAST(FLOOR(CEIL(??)/??) AS INT)*?? || '-' || CAST(FLOOR(CEIL(??)/??) AS INT)*??+??) AS ??", [
            filters_1.buildFullName(args, query, args.field, false),
            amount,
            amount,
            filters_1.buildFullName(args, query, args.field, false),
            amount,
            amount,
            amount - 1,
            alias || args.field,
        ]), knex.raw("(CAST(FLOOR(CEIL(??)/??) AS INT)*??) AS ??", [
            filters_1.buildFullName(args, query, args.field, false),
            amount,
            amount,
            "groupByEach_min_" + (alias || args.field),
        ]), knex.raw("(CAST(FLOOR(CEIL(??)/??) AS INT)*??+??) AS ??", [
            filters_1.buildFullName(args, query, args.field, false),
            amount,
            amount,
            amount - 1,
            "groupByEach_max_" + (alias || args.field),
        ]))
            .groupBy(knex.raw('CAST(FLOOR(CEIL(??)/??) AS INT)', [
            filters_1.buildFullName(args, query, args.field, false),
            amount,
        ]));
        query.getters.push("groupByEach_max_" + (alias || args.field));
        query.getters.push("groupByEach_min_" + (alias || args.field));
        return query.promise;
    }, {
        field: types_1.PropTypes.string.isRequired,
        from: types_1.PropTypes.string,
        each: types_1.PropTypes.number
    }, ['CAST', 'FLOOR', 'CEIL', 'GROUP BY']),
    combine: wrapper_1.dimensionWrapper(function (_, args, query, knex) {
        console.log('Combine called');
        if (!args.fields || !Array.isArray(args.fields))
            throw "Combine function requires 'fields' argument with a list of fields";
        args.fields.forEach(function (field) {
            if (typeof field === 'string') {
                var clonedQuery = parser_1.parseDimension({
                    name: {
                        value: field
                    }
                }, query, knex);
                query = query_combiner_1.combineQuery(query, clonedQuery);
                query.promise = clonedQuery.promise;
            }
            else {
                if (!field.name)
                    throw 'Combine by elements must have name';
                var name_1 = field.name, alias = field.alias, resolver = field.resolver, rest = __rest(field, ["name", "alias", "resolver"]);
                var tree = {
                    name: {
                        value: name_1
                    },
                    resolver: {
                        value: resolver
                    }
                };
                if (alias) {
                    tree.alias = {
                        value: alias
                    };
                }
                tree.arguments = rest;
                var clonedQuery = parser_1.parseDimension(tree, query, knex);
                query = query_combiner_1.combineQuery(query, clonedQuery);
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
                resolver: types_1.PropTypes.string
            }),
        ])).isRequired
    }, ['GROUP BY']),
    "default": wrapper_1.dimensionWrapper(function (alias, args, query, knex, _a) {
        var tree = _a.tree;
        var fullName = filters_1.buildFullName(args, query, tree.name.value, false);
        return query.promise
            .select(alias ? knex.raw("?? AS ??", [fullName, alias]) : fullName)
            .groupBy(fullName);
    }, {
        from: types_1.PropTypes.string
    }, ['GROUP BY']),
    join: cross_table_1.join(cross_table_1.JoinType.DEFAULT, cross_table_1.Kind.DIMENSION),
    leftJoin: cross_table_1.join(cross_table_1.JoinType.LEFT, cross_table_1.Kind.DIMENSION),
    rightJoin: cross_table_1.join(cross_table_1.JoinType.RIGHT, cross_table_1.Kind.DIMENSION),
    fullJoin: cross_table_1.join(cross_table_1.JoinType.FULL, cross_table_1.Kind.DIMENSION),
    innerJoin: cross_table_1.join(cross_table_1.JoinType.INNER, cross_table_1.Kind.DIMENSION),
    leftOuterJoin: cross_table_1.join(cross_table_1.JoinType.LEFT_OUTER, cross_table_1.Kind.DIMENSION),
    rightOuterJoin: cross_table_1.join(cross_table_1.JoinType.RIGHT_OUTER, cross_table_1.Kind.DIMENSION),
    fullOuterJoin: cross_table_1.join(cross_table_1.JoinType.FULL_OUTER, cross_table_1.Kind.DIMENSION)
};
