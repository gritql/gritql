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
exports.gaMetricResolvers = exports.gaQueryBuilder = void 0;
var luxon_1 = require("luxon");
function gaQueryBuilder(table, tree, queries, idx, knex, metricResolvers) {
    var _a, _b, _c, _d, _e, _f;
    if (queries === void 0) { queries = []; }
    if (idx === void 0) { idx = undefined; }
    //console.log(queries.map(q => q.promise._statements))
    //console.log(tree, idx, queries)
    //console.log(queries, idx, tree.length)
    if (!!~idx && idx !== undefined && !queries[idx])
        queries[idx] = { idx: idx, name: undefined, source: 'GA' };
    var query = queries[idx];
    if (Array.isArray(tree)) {
        //we replace query with next level
        return tree.reduce(function (queries, t, i) { return gaQueryBuilder(table, t, queries, queries.length - 1, knex, metricResolvers); }, queries);
    }
    if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
        if (tree.operation === 'query' && !!((_a = tree.name) === null || _a === void 0 ? void 0 : _a.value)) {
            table = (_b = tree.name) === null || _b === void 0 ? void 0 : _b.value;
        }
        if (tree.operation === 'mutation')
            return queries;
        return tree.selectionSet.selections.reduce(function (queries, t, i) { return gaQueryBuilder(table, t, queries, queries.length, knex, metricResolvers); }, queries);
    }
    if (!query.filters && tree.name.value === 'fetch') {
        query.name = ((_c = tree.alias) === null || _c === void 0 ? void 0 : _c.value) || null;
        query.table = table;
        query.dimensions = [];
        query.metrics = [];
        query.orderBys = [];
        query.postQueryTransform = [];
        query.filters = parseFilters(tree);
        if (!((_d = tree.selectionSet) === null || _d === void 0 ? void 0 : _d.selections))
            throw "The query is empty, you need specify metrics or dimensions";
        var contextQuery = query;
        query.generatePromise = function (query) {
            var preparedFilters = query.filters.reduce(function (r, f) {
                r[f[0].replace("_", "-")] = f[2];
                return r;
            }, {});
            var deduplicatedDimensions = Array.from(new Set(query.dimensions));
            var deduplicatedMetrics = Array.from(new Set(query.metrics));
            var request = __assign(__assign({}, preparedFilters), { dimensions: deduplicatedDimensions.reduce(arrayToGaString, ''), metrics: deduplicatedMetrics.reduce(arrayToGaString, ''), sort: query.orderBys.length > 0 ? (query.orderBys.reduce(arrayToGaString, '')) : undefined });
            var thePromise = (new Promise(function (resolve, reject) {
                resolve(request);
            }))["catch"](function (e) { return console.log(e); });
            thePromise.toString = function () { return request; };
            return thePromise;
        };
    }
    //console.log(JSON.stringify(tree, null, 2))
    if (query.name === undefined)
        throw "Builder: Cant find fetch in the payload";
    if (!!((_e = tree.selectionSet) === null || _e === void 0 ? void 0 : _e.selections)) {
        var selections = tree.selectionSet.selections;
        var _g = selections.reduce(function (r, s) {
            //check multiple dimensions we also need to split queries in the case
            if (r[1] && !!s.selectionSet)
                return [true, true];
            return [r[0] || !s.selectionSet, r[1] || !!s.selectionSet];
        }, [false, false]), haveMetric_1 = _g[0], haveDimension_1 = _g[1];
        if (((_f = tree.name) === null || _f === void 0 ? void 0 : _f.value) !== 'fetch' && !tree["with"])
            parseDimension(tree, query, knex);
        selections.sort(function (a, b) { return !b.selectionSet ? -1 : 1; });
        return selections.reduce(function (queries, t, i) {
            if (!!t.selectionSet && haveMetric_1 && haveDimension_1) {
                var newIdx = queries.length;
                queries[newIdx] = __assign({}, queries[idx]);
                if (!!query.metrics)
                    queries[newIdx].metrics = JSON.parse(JSON.stringify(query.metrics));
                if (!!query.dimensions)
                    queries[newIdx].dimensions = JSON.parse(JSON.stringify(query.dimensions));
                if (!!query.sort)
                    queries[newIdx].sort = JSON.parse(JSON.stringify(query.sort));
                queries[newIdx].idx = newIdx;
                return gaQueryBuilder(table, t, queries, newIdx, knex, metricResolvers);
            }
            return gaQueryBuilder(table, t, queries, idx, knex, metricResolvers);
        }, queries);
    }
    parseMetric(tree, query, knex, metricResolvers);
    return queries;
}
exports.gaQueryBuilder = gaQueryBuilder;
function parseMetric(tree, query, knex, metricResolvers) {
    var _a, _b, _c;
    var _d = query.metrics, metrics = _d === void 0 ? [] : _d;
    if (tree.alias && metricResolvers[(_a = tree.name) === null || _a === void 0 ? void 0 : _a.value])
        return metricResolvers[(_b = tree.name) === null || _b === void 0 ? void 0 : _b.value](tree, query, knex);
    query.metrics = metrics;
    query.metrics.push((_c = tree.name) === null || _c === void 0 ? void 0 : _c.value);
}
function parseDimension(tree, query, knex) {
    var _a = query.dimensions, dimensions = _a === void 0 ? [] : _a;
    if (!query.groupIndex)
        query.groupIndex = 0;
    query.groupIndex++;
    var args = argumentsToObject(tree.arguments);
    if (args === null || args === void 0 ? void 0 : args.groupBy) {
        query.postQueryTransform.push(function (result) {
            return result.reduce(function (r, l) {
                var _a;
                var newDate = luxon_1.DateTime.fromISO(l[tree.name.value]).startOf(args === null || args === void 0 ? void 0 : args.groupBy).toISODate();
                l = __assign(__assign({}, l), (_a = {}, _a[tree.name.value] = newDate, _a));
                var nonNumeric = getNonNumericKeys(l);
                var line = r.find(matchNonNumeric(__spreadArray(__spreadArray([], nonNumeric), [tree.name.value]), l));
                if (!line) {
                    r.push(__assign({}, l));
                }
                else {
                    Object.keys(l).forEach(function (key) {
                        if (!~nonNumeric.indexOf(key))
                            line[key] = !!line[key] ? (+line[key] + +l[key]) : +l[key];
                    });
                }
                return r;
            }, []);
        });
    }
    if (!!(args === null || args === void 0 ? void 0 : args.sort_desc))
        query.orderBys = (query.orderBys || []).concat("-" + (args === null || args === void 0 ? void 0 : args.sort_desc));
    if (!!(args === null || args === void 0 ? void 0 : args.sort_asc))
        query.orderBys = (query.orderBys || []).concat(args === null || args === void 0 ? void 0 : args.sort_asc);
    dimensions.push(tree.name.value);
    query.dimensions = dimensions;
}
function parseFilters(tree) {
    var args = tree.arguments;
    return args.reduce(function (res, arg) {
        if (arg.name.value.endsWith('_gt'))
            return res.concat([[arg.name.value.replace('_gt', ''), '>', arg.value.value]]);
        if (arg.name.value.endsWith('_gte'))
            return res.concat([[arg.name.value.replace('_gte', ''), '>=', arg.value.value]]);
        if (arg.name.value.endsWith('_lt'))
            return res.concat([[arg.name.value.replace('_lt', ''), '<', arg.value.value]]);
        if (arg.name.value.endsWith('_lte'))
            return res.concat([[arg.name.value.replace('_lte', ''), '<=', arg.value.value]]);
        if (arg.name.value.endsWith('_like'))
            return res.concat([[arg.name.value.replace('_like', ''), 'LIKE', arg.value.value]]);
        if (arg.name.value.endsWith('_in'))
            return res.concat([[arg.name.value.replace('_in', ''), 'in', arg.value.value.split('|')]]);
        return res.concat([[arg.name.value, '=', arg.value.value]]);
    }, []);
}
function getNonNumericKeys(l) {
    return Object.keys(l).filter(function (k) { return isNaN(+l[k]); });
}
function matchNonNumeric(keys, compareLine) {
    return function (line) {
        return !keys.reduce(function (r, k) { return r || line[k] !== compareLine[k]; }, false);
    };
}
function argumentsToObject(args) {
    if (!args)
        return null;
    return args.reduce(function (r, a) {
        var _a;
        return (__assign(__assign({}, r), (_a = {}, _a[a.name.value] = a.value.value, _a)));
    }, {});
}
function arrayToGaString(r, el, i) {
    return r + el.replace(/^(-?)(\w)/, (i === 0 ? '' : ',') + "$1ga:$2");
}
exports.gaMetricResolvers = {
    divide: function (tree, query, knex) {
        if (!tree.arguments)
            throw "Sum function requires arguments";
        var args = argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Sum function requires 'a' as argument";
        if (!args.by)
            throw "Sum function requires 'by' as argument";
        query.postQueryTransform.push(function (result) {
            return result.map(function (l) {
                var _a;
                return (__assign(__assign({}, l), (_a = {}, _a[tree.alias.value] = l[args.a] / l[args.by], _a)));
            });
        });
        if (!~query.metrics.indexOf(args.a))
            query.metrics.push(args.a);
        if (!~query.metrics.indexOf(args.by))
            query.metrics.push(args.by);
    },
    indexed: function (tree, query, knex) {
        if (!tree.arguments)
            throw "Indexed function requires arguments";
        var args = argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Indexed  function requires 'a' as argument";
        //if (!!args.by) throw "Indexed  function doesnot support 'a' as argument";
        query.postQueryTransform.push(function (result) {
            var maxValue = Math.max.apply(Math, result.map(function (l) { return l[args.a]; }));
            return result.map(function (l) {
                var _a;
                return (__assign(__assign({}, l), (_a = {}, _a[tree.alias.value] = l[args.a] / maxValue, _a)));
            });
        });
        if (!~query.metrics.indexOf(args.a))
            query.metrics.push(args.a);
    }
};
