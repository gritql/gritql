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
var __spreadArray = (this && this.__spreadArray) || function (to, from) {
    for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
        to[j] = from[i];
    return to;
};
exports.__esModule = true;
exports.applyRawJoin = exports.applyFilters = exports.parseAdvancedFilters = exports.buildFilter = exports.buildFullName = void 0;
var _ = require("lodash");
var arguments_1 = require("./arguments");
var filterOperators = [
    'and',
    'eq',
    'gt',
    'gte',
    'in',
    'lt',
    'lte',
    'ne',
    'nin',
    'nor',
    'not',
    'or',
    'regex',
    'search',
    'from',
    'inherited',
];
function buildFullName(args, query, field, evaluateOnlyWithLinkSymbol) {
    if (evaluateOnlyWithLinkSymbol === void 0) { evaluateOnlyWithLinkSymbol = true; }
    args = Array.isArray(args) ? arguments_1.argumentsToObject(args) : args;
    var table = args.from || query.table;
    if (!(field === null || field === void 0 ? void 0 : field.startsWith('@')) && (evaluateOnlyWithLinkSymbol || !args.from)) {
        return field;
    }
    else {
        return table + "." + field.replace(/^@/, '');
    }
}
exports.buildFullName = buildFullName;
function runDefaultRunner(context, operator, field, subQuery) {
    return runOrSkip(context, typeof operator === 'string'
        ? function (_a) {
            var key = _a.key, value = _a.value, isField = _a.isField, context = _a.context;
            return context.knex.raw("?? " + operator + " " + (isField ? '??' : '?'), [
                key,
                value,
            ]);
        }
        : operator, function (_a) {
        var context = _a.context;
        return buildFullName(__assign(__assign({}, context), { from: context.from || context.query.table }), context.query, field, false);
    }, '', context.valueTransformer(context, field, subQuery));
}
function runOrSkip(context, runner, key, accum, value) {
    var ctx = context;
    if (typeof key === 'function') {
        key = key({ context: ctx });
    }
    if (key === 'from') {
        if (!ctx.ignoreFrom) {
            ctx.from = value;
        }
        return accum;
    }
    else if (key === 'inherited') {
        ctx.inherited = value;
        return accum;
    }
    if (ctx.onlyInherited &&
        ctx.inherited === false &&
        !__spreadArray([ctx.query.table], ctx.query.joins).includes(ctx.from || ctx.query.table)) {
        return accum;
    }
    else {
        var v = (value === null || value === void 0 ? void 0 : value.isField) ? value.value : (value === null || value === void 0 ? void 0 : value.value) || value;
        return runner({ key: key, value: v, isField: value === null || value === void 0 ? void 0 : value.isField, context: ctx });
    }
}
function getCombineRunner(accum, runner, combiner) {
    if (combiner === void 0) { combiner = 'AND'; }
    var res = runner();
    if (res) {
        if (accum) {
            return accum + " " + combiner + " (" + res + ")";
        }
        else {
            return "(" + res + ")";
        }
    }
    else {
        return accum;
    }
}
function buildFilter(query, context, prefix) {
    if (prefix === void 0) { prefix = ''; }
    var ops = _.mapValues(_.keyBy(filterOperators), function (op) { return "" + prefix + op; });
    var isOp = function (key) { return _.includes(_.values(ops), key); };
    var getOp = function (key) { return (isOp(key) ? key : null); };
    var sub = function (subQuery, op, field, context) {
        switch (op) {
            case ops.and:
                return runOrSkip(context, function (_a) {
                    var context = _a.context;
                    return '(' +
                        _.reduce(subQuery, function (accum, cur) {
                            return runOrSkip(context, function (_a) {
                                var context = _a.context;
                                return getCombineRunner(accum, function () {
                                    return buildFilter(cur, context, prefix);
                                });
                            }, '', accum, cur);
                        }, '') +
                        ')';
                }, '', '', subQuery);
            case ops.or:
                return runOrSkip(context, function (_a) {
                    var context = _a.context;
                    return '(' +
                        _.reduce(subQuery, function (accum, cur) {
                            return runOrSkip(context, function (_a) {
                                var context = _a.context;
                                return getCombineRunner(accum, function () { return buildFilter(cur, context, prefix); }, 'OR');
                            }, '', accum, '');
                        }, '') +
                        ')';
                }, '', '', subQuery);
            case ops.nor:
                return runOrSkip(context, function (_a) {
                    var context = _a.context;
                    return 'NOT (' +
                        _.reduce(subQuery, function (accum, cur) {
                            return runOrSkip(context, function (_a) {
                                var context = _a.context;
                                return getCombineRunner(accum, function () { return buildFilter(cur, context, prefix); }, 'OR');
                            }, '', accum, cur);
                        }, '') +
                        ')';
                }, '', '', subQuery);
            case ops["in"]:
                if (!_.isArray(subQuery)) {
                    throw 'IN requries array value';
                }
                return runDefaultRunner(context, function (_a) {
                    var k = _a.key, v = _a.value, context = _a.context;
                    return context.knex.raw("?? IN (" + _.map(subQuery, function () { return '?'; }).join(',') + ")", __spreadArray([k], v));
                }, field, subQuery);
            case ops.nin:
                if (!_.isArray(subQuery)) {
                    throw 'NIN requries array value';
                }
                return runDefaultRunner(context, function (_a) {
                    var k = _a.key, v = _a.value, context = _a.context;
                    return context.knex.raw("?? NOT IN(" + _.map(subQuery, function () { return '?'; }).join(',') + ")", __spreadArray([k], v));
                }, field, subQuery);
            case ops.eq:
                return runDefaultRunner(context, '=', field, subQuery);
            case ops.gt:
                return runDefaultRunner(context, '>', field, subQuery);
            case ops.gte:
                return runDefaultRunner(context, '>=', field, subQuery);
            case ops.lt:
                return runDefaultRunner(context, '<', field, subQuery);
            case ops.lte:
                return runDefaultRunner(context, '<=', field, subQuery);
            case ops.ne:
                return runDefaultRunner(context, '<>', field, subQuery);
            case ops.not:
                return runOrSkip(context, function () { return "NOT (" + buildFilter(subQuery, context, prefix) + ")"; }, '', '', subQuery);
            case ops.regex:
                return runDefaultRunner(context, 'LIKE', field, subQuery);
            case ops.search:
                if (_.isObject(subQuery)) {
                    if (_.every(subQuery, isOp)) {
                        throw 'At least one property of search must be related to field';
                    }
                    return _.reduce(subQuery, function (accum, v, k) {
                        var _a;
                        var _b, _c;
                        if (isOp(k)) {
                            return runOrSkip(context, function (_a) {
                                var context = _a.context;
                                return getCombineRunner(accum, function () {
                                    return sub(v, getOp(k), field, __assign({}, context));
                                });
                            }, k, accum, v);
                        }
                        var key = buildFullName(__assign(__assign({}, context), { from: context.from || context.query.table }), context.query, k, false);
                        var value = context.valueTransformer(context, k, v);
                        var transformedValue = (value === null || value === void 0 ? void 0 : value.isField)
                            ? value.value
                            : (value === null || value === void 0 ? void 0 : value.value) || value;
                        if ((_b = context.query.search) === null || _b === void 0 ? void 0 : _b[key]) {
                            throw "Search for " + key + " already defined";
                        }
                        context.query.search = __assign(__assign({}, context.query.search), (_a = {}, _a[key] = ((_c = context.query.search) === null || _c === void 0 ? void 0 : _c[key]) || value, _a));
                        var tsQuery = context.knex.raw("to_tsvector('simple', ??) @@ (plainto_tsquery('simple', " + ((value === null || value === void 0 ? void 0 : value.isField) ? '??' : '?') + ")::text || ':*')::tsquery", [key, transformedValue]);
                        return runOrSkip(context, function () { return (accum ? accum + " AND " + tsQuery : tsQuery); }, key, accum, value);
                    }, '');
                }
                else {
                    throw 'Search filter requires object value';
                }
            default:
                return _.isObject(subQuery)
                    ? _.reduce(subQuery, function (accum, v, k) {
                        return runOrSkip(context, function (_a) {
                            var context = _a.context;
                            return getCombineRunner(accum, function () {
                                return sub(v, getOp(k), field, __assign({}, context));
                            });
                        }, k, accum, v);
                    }, '')
                    : field
                        ? runDefaultRunner(context, '=', field, subQuery)
                        : subQuery;
        }
    };
    return _.reduce(query, function (accum, subQuery, key) {
        var field = isOp(key) ? null : key;
        var op = isOp(key) ? key : null;
        return runOrSkip(context, function (_a) {
            var context = _a.context;
            return getCombineRunner(accum, function () {
                return sub(subQuery, op, field, __assign({}, context));
            });
        }, key, accum, subQuery);
    }, '');
}
exports.buildFilter = buildFilter;
function parseAdvancedFilters(query, knex, filters, onlyInherited, from) {
    var result = {
        where: '',
        having: ''
    };
    if (filters) {
        var where = _.omit(filters, ['having']);
        if (from) {
            where = __assign(__assign({}, where), { from: from });
        }
        result.where = buildFilter(where, {
            query: query,
            knex: knex,
            onlyInherited: onlyInherited,
            valueTransformer: function (context, k, v) {
                return v;
            }
        });
        if (filters.having) {
            var having = filters.having;
            if (from) {
                having = __assign(__assign({}, having), { from: from });
            }
            result.having = buildFilter(having, {
                query: query,
                knex: knex,
                onlyInherited: onlyInherited,
                valueTransformer: function (context, k, v) {
                    return v;
                }
            });
        }
    }
    return result;
}
exports.parseAdvancedFilters = parseAdvancedFilters;
function applyFilters(query, knexPipe, knex) {
    var _a, _b;
    if ((_a = query.preparedAdvancedFilters) === null || _a === void 0 ? void 0 : _a.where) {
        knexPipe.where(knex.raw(query.preparedAdvancedFilters.where));
    }
    if ((_b = query.preparedAdvancedFilters) === null || _b === void 0 ? void 0 : _b.having) {
        knexPipe.having(knex.raw(query.preparedAdvancedFilters.having));
    }
    return knexPipe;
}
exports.applyFilters = applyFilters;
function applyRawJoin(query, knex, joinType, from, on) {
    query.joins = query.joins || [];
    query.joins.push(from);
    return (query.promise = query.promise.joinRaw(joinType
        .split(/(?=[A-Z])/)
        .join(' ')
        .toUpperCase() + " ?? ON " + buildFilter(on, {
        query: query,
        knex: knex,
        from: from,
        ignoreFrom: true,
        valueTransformer: function (context, k, v) {
            if (typeof v === 'string') {
                return {
                    value: buildFullName({ context: context, from: context.query.table }, context.query, v, true),
                    isField: v === null || v === void 0 ? void 0 : v.startsWith('@')
                };
            }
            else {
                return v;
            }
        }
    }), [from]));
}
exports.applyRawJoin = applyRawJoin;
