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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.merge = exports.gqlToDb = void 0;
var gql = require('graphql-tag');
var pg = require('pg');
pg.types.setTypeParser(20, parseInt);
var knexConstructor = require('knex');
var arguments_1 = require("./arguments");
var directives_1 = require("./directives");
var gql_ga_slicer_1 = require("./gql-ga-slicer");
var progressive_1 = require("./progressive");
var lodash_1 = require("lodash");
var filters_1 = require("./filters");
var JoinType;
(function (JoinType) {
    JoinType["DEFAULT"] = "join";
    JoinType["LEFT"] = "leftJoin";
    JoinType["RIGHT"] = "rightJoin";
    JoinType["FULL"] = "fullJoin";
    JoinType["INNER"] = "innerJoin";
    JoinType["LEFT_OUTER"] = "leftOuterJoin";
    JoinType["RIGHT_OUTER"] = "rightOuterJoin";
    JoinType["FULL_OUTER"] = "fullOuterJoin";
})(JoinType || (JoinType = {}));
function changeQueryTable(query, knex, table, dropJoins) {
    if (table !== query.table) {
        query.table = table;
        query.promise.from(query.table);
        if (dropJoins) {
            query.joins = [];
        }
        query.search = {};
        query.preparedAdvancedFilters = filters_1.parseAdvancedFilters(query, knex, query.advancedFilters, true);
    }
    return query;
}
function transformFilters(args, query, knex) {
    return args.reduce(function (res, arg) {
        if (arg.name.value === 'from') {
            return res;
        }
        // We need to ensure that we are not in join context
        if (!!knex) {
            if (arg.name.value === 'table') {
                changeQueryTable(query, knex, arg.value.value, false);
                return res;
            }
            if (arg.name.value === 'filters') {
                query.advancedFilters = arguments_1.argumentsToObject(arg.value.fields);
                query.preparedAdvancedFilters = filters_1.parseAdvancedFilters(query, knex, query.advancedFilters, true);
                return res;
            }
        }
        if (Object.values(JoinType).includes(arg.name.value)) {
            if (query && knex) {
                join(arg.name.value)(arg.value, query, knex);
                return res;
            }
            else {
                throw "Join can't be called inside of join";
            }
        }
        if (arg.name.value === 'search') {
            var elements_1 = arguments_1.argumentsToObject(arg.value.value);
            return res.concat([
                Object.keys(elements_1).reduce(function (accum, k) {
                    var _a;
                    var _b, _c;
                    var key = filters_1.buildFullName(args, query, k, false);
                    var v = elements_1[k];
                    if ((_b = query.search) === null || _b === void 0 ? void 0 : _b[key]) {
                        throw "Search for " + key + " already defined";
                    }
                    query.search = __assign(__assign({}, query.search), (_a = {}, _a[key] = ((_c = query.search) === null || _c === void 0 ? void 0 : _c[key]) || v, _a));
                    accum.push([key, 'search', v]);
                    return accum;
                }, []),
            ]);
        }
        if (arg.name.value.endsWith('_gt'))
            return res.concat([
                [
                    filters_1.buildFullName(args, query, arg.name.value.replace('_gt', ''), false),
                    '>',
                    arg.value.value,
                ],
            ]);
        if (arg.name.value.endsWith('_gte'))
            return res.concat([
                [
                    filters_1.buildFullName(args, query, arg.name.value.replace('_gte', ''), false),
                    '>=',
                    arg.value.value,
                ],
            ]);
        if (arg.name.value.endsWith('_lt'))
            return res.concat([
                [
                    filters_1.buildFullName(args, query, arg.name.value.replace('_lt', ''), false),
                    '<',
                    arg.value.value,
                ],
            ]);
        if (arg.name.value.endsWith('_lte'))
            return res.concat([
                [
                    filters_1.buildFullName(args, query, arg.name.value.replace('_lte', ''), false),
                    '<=',
                    arg.value.value,
                ],
            ]);
        if (arg.name.value.endsWith('_like'))
            return res.concat([
                [
                    filters_1.buildFullName(args, query, arg.name.value.replace('_like', ''), false),
                    'LIKE',
                    arg.value.value,
                ],
            ]);
        if (arg.name.value.endsWith('_in'))
            return res.concat([
                [
                    filters_1.buildFullName(args, query, arg.name.value.replace('_in', ''), false),
                    'in',
                    arg.value.value.split('|'),
                ],
            ]);
        return res.concat([
            [filters_1.buildFullName(args, query, arg.name.value, false), '=', arg.value.value],
        ]);
    }, []);
}
function join(type) {
    return function (tree, query, knex) {
        if (!tree.arguments && !tree.fields)
            throw 'Join function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments || tree.fields);
        if (!args.table)
            throw "Join function requires 'table' as argument";
        var byKeys = [
            'by',
            'by_gt',
            'by_gte',
            'by_lt',
            'by_lte',
            'by_like',
            'by_in',
        ].filter(function (key) { return args[key] !== undefined; });
        if (!byKeys.length && (!args.on || Object.keys(args.on).length === 0))
            throw "Join function requires 'by' or 'on' as argument";
        if (byKeys.length) {
            var filters_2 = transformFilters((tree.arguments || tree.fields)
                .filter(function (_a) {
                var value = _a.name.value;
                return byKeys.includes(value);
            })
                .concat({ name: { value: 'from' }, value: { value: args.table } }), query);
            query.promise[type](args.table, function () {
                var _this = this;
                //this.on(function () {
                filters_2.forEach(function (_a, index) {
                    var _ = _a[0], operator = _a[1], value = _a[2];
                    var onFunc = index === 0 ? _this.on : _this.andOn;
                    var _b = value.split(':'), leftSide = _b[0], rightSide = _b[1];
                    if (!leftSide || !rightSide) {
                        throw "'by' argument inside Join function must include two fields (divided with :)";
                    }
                    leftSide = filters_1.buildFullName({}, query, leftSide);
                    rightSide = filters_1.buildFullName({ from: args.table }, query, rightSide);
                    onFunc.call(_this, leftSide, operator, rightSide);
                });
                //})
            });
        }
        else {
            filters_1.applyRawJoin(query, knex, type, args.table, args.on);
        }
        query.joins = query.joins || [];
        query.joins.push(args.table);
    };
}
var gqlToDb = function (opts) {
    if (opts === void 0) { opts = { client: 'pg' }; }
    var knex = knexConstructor(opts);
    var beforeDbHandler = function (r) { return Promise.resolve(r); };
    var dbHandler = function (_a) {
        var queries = _a.queries;
        return Promise.all(queries.map(function (q) {
            //todo: remove this bullshit
            //I just need to rethink whole thing
            if (q.postQueryTransform) {
                return q.postQueryTransform.reduce(function (next, t) {
                    return next.then(t);
                }, q.promise);
            }
            return q.promise;
        }));
    };
    var customMetricResolvers = {};
    var customMetricDataResolvers = {};
    var gqlFetch = function (gqlQuery) { return __awaiter(void 0, void 0, void 0, function () {
        var definitions_1, queries, sql, preparedGqlQuery, resultFromDb, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    definitions_1 = gql(gqlQuery).definitions;
                    queries = queryBuilder(null, definitions_1, undefined, undefined, knex, __assign(__assign({}, metricResolvers), customMetricResolvers))
                        .filter(function (q) { return !q.skip; })
                        .map(function (q) {
                        q.promise = filters_1.applyFilters(q, q.promise, knex);
                        return q;
                    })
                        .map(function (q) {
                        if (q.postQueryProcessing)
                            q.postQueryProcessing(definitions_1, q, knex);
                        if (q.generatePromise)
                            q.promise = q.generatePromise(q);
                        return q;
                    });
                    sql = queries
                        .filter(function (q) { return !q.isWith; })
                        .map(function (q) { return q.promise.toString(); });
                    return [4 /*yield*/, beforeDbHandler({
                            queries: queries.filter(function (q) { return !q.isWith; }),
                            sql: sql,
                            definitions: definitions_1
                        })];
                case 1:
                    preparedGqlQuery = _a.sent();
                    if (!preparedGqlQuery)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, dbHandler(preparedGqlQuery)];
                case 2:
                    resultFromDb = _a.sent();
                    if (!resultFromDb)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, exports.merge(definitions_1, resultFromDb, __assign(__assign({}, metricResolversData), customMetricDataResolvers))];
                case 3: return [2 /*return*/, _a.sent()];
                case 4:
                    e_1 = _a.sent();
                    console.log(e_1);
                    throw Error(e_1);
                case 5: return [2 /*return*/];
            }
        });
    }); };
    gqlFetch.beforeDbFetch = function (fn) {
        beforeDbHandler = fn;
        return gqlFetch;
    };
    gqlFetch.dbFetch = function (fn) {
        dbHandler = fn;
        return gqlFetch;
    };
    gqlFetch.useResolver = function (name, fn) {
        var _a;
        customMetricResolvers = __assign(__assign({}, customMetricResolvers), (_a = {}, _a[name] = fn, _a));
    };
    gqlFetch.useDataResolver = function (name, fn) {
        var _a;
        customMetricDataResolvers = __assign(__assign({}, customMetricDataResolvers), (_a = {}, _a[name] = fn, _a));
    };
    return gqlFetch;
};
exports.gqlToDb = gqlToDb;
function queryBuilder(table, tree, queries, idx, knex, metricResolvers) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    if (queries === void 0) { queries = []; }
    if (idx === void 0) { idx = undefined; }
    //console.log(queries.map(q => q.promise._statements))
    //console.log(tree, idx, queries)
    //console.log(queries, idx, tree.length)
    if (!!~idx && idx !== undefined && !queries[idx])
        queries[idx] = { idx: idx, name: undefined };
    var query = queries[idx];
    if (Array.isArray(tree)) {
        //we replace query with next level
        return tree.reduce(function (queries, t, i) {
            return queryBuilder(table, t, queries, queries.length - 1, knex, metricResolvers);
        }, queries);
    }
    if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
        if (tree.operation === 'query' && !!((_a = tree.name) === null || _a === void 0 ? void 0 : _a.value)) {
            if (((_d = (_c = (_b = tree === null || tree === void 0 ? void 0 : tree.variableDefinitions[0]) === null || _b === void 0 ? void 0 : _b.variable) === null || _c === void 0 ? void 0 : _c.name) === null || _d === void 0 ? void 0 : _d.value) === 'source' &&
                ((_g = (_f = (_e = tree === null || tree === void 0 ? void 0 : tree.variableDefinitions[0]) === null || _e === void 0 ? void 0 : _e.type) === null || _f === void 0 ? void 0 : _f.name) === null || _g === void 0 ? void 0 : _g.value) === 'GA') {
                return gql_ga_slicer_1.gaQueryBuilder(table, tree, queries, idx, knex, gql_ga_slicer_1.gaMetricResolvers);
            }
            table = (_h = tree.name) === null || _h === void 0 ? void 0 : _h.value;
        }
        if (tree.operation === 'mutation')
            return queries;
        return tree.selectionSet.selections.reduce(function (queries, t, i) {
            return queryBuilder(table, t, queries, queries.length, knex, metricResolvers);
        }, queries);
    }
    if (!query.filters &&
        (tree.name.value === 'fetch' ||
            tree.name.value === 'fetchPlain' ||
            tree.name.value === 'with')) {
        query.name = ((_j = tree.alias) === null || _j === void 0 ? void 0 : _j.value) || null;
        query.table = table;
        query.promise = knex.select().from(table);
        query.joins = [];
        query.filters = parseFilters(tree, query, knex);
        query.promise = withFilters(query.filters)(query.promise);
        if (tree.name.value === 'with') {
            query.isWith = true;
        }
        if (query.table === undefined) {
            throw 'Table name must be specified trought table argument or query name';
        }
        if (!query.isWith) {
            queries
                .filter(function (q) { return q !== query && q.isWith; })
                .forEach(function (q) {
                query.promise = query.promise["with"](q.name, q.promise);
            });
        }
        if (!((_k = tree.selectionSet) === null || _k === void 0 ? void 0 : _k.selections))
            throw 'The query is empty, you need specify metrics or dimensions';
    }
    //console.log(JSON.stringify(tree, null, 2))
    if (query.name === undefined) {
        throw 'Builder: Cant find fetch in the payload';
    }
    if (!!((_l = tree.selectionSet) === null || _l === void 0 ? void 0 : _l.selections)) {
        var selections = tree.selectionSet.selections;
        var _q = selections.reduce(function (r, s) {
            //check multiple dimensions we also need to split queries in the case
            if (r[1] && !!s.selectionSet)
                return [true, true];
            return [r[0] || !s.selectionSet, r[1] || !!s.selectionSet];
        }, [false, false]), haveMetric_1 = _q[0], haveDimension_1 = _q[1];
        if (((_m = tree.name) === null || _m === void 0 ? void 0 : _m.value) !== 'fetch' &&
            ((_o = tree.name) === null || _o === void 0 ? void 0 : _o.value) !== 'fetchPlain' &&
            ((_p = tree.name) === null || _p === void 0 ? void 0 : _p.value) !== 'with' &&
            !tree["with"])
            parseDimension(tree, query, knex);
        selections.sort(function (a, b) {
            if (!b.selectionSet === !a.selectionSet) {
                return 0;
            }
            else if (!b.selectionSet) {
                return -1;
            }
            else {
                return 1;
            }
        });
        return selections.reduce(function (queries, t, i) {
            if (!!t.selectionSet && haveMetric_1 && haveDimension_1) {
                var newIdx = queries.length;
                queries[newIdx] = __assign({}, queries[idx]);
                if (!!query.metrics)
                    queries[newIdx].metrics = lodash_1.cloneDeep(query.metrics);
                if (!!query.dimensions)
                    queries[newIdx].dimensions = lodash_1.cloneDeep(query.dimensions);
                queries[newIdx].promise = query.promise.clone();
                queries[newIdx].idx = newIdx;
                return queryBuilder(table, t, queries, newIdx, knex, metricResolvers);
            }
            return queryBuilder(table, t, queries, idx, knex, metricResolvers);
        }, queries);
    }
    parseMetric(tree, query, knex, metricResolvers);
    return queries;
}
function parseMetric(tree, query, knex, metricResolvers) {
    var _a, _b, _c, _d, _e, _f, _g;
    var args = arguments_1.argumentsToObject(tree.arguments);
    var _h = query.metrics, metrics = _h === void 0 ? [] : _h;
    query.metrics = metrics;
    if (tree.alias && metricResolvers[(_a = tree.name) === null || _a === void 0 ? void 0 : _a.value])
        return metricResolvers[(_b = tree.name) === null || _b === void 0 ? void 0 : _b.value](tree, query, knex);
    // Getters are needed only for additionaly selected fields by some specific functions
    // example: price(groupByEach: 50) -> price: 0-50 -> groupByEach_min_price: 0 -> groupByEach_max_price: 50
    // would be useful for further grouping && filtering
    var isInGetters = (_c = query.getters) === null || _c === void 0 ? void 0 : _c.find(function (name) { var _a; return name === ((_a = tree.name) === null || _a === void 0 ? void 0 : _a.value); });
    if (!isInGetters) {
        if (!((_d = tree.alias) === null || _d === void 0 ? void 0 : _d.value)) {
            query.promise = query.promise.select("" + filters_1.buildFullName(args, query, tree.name.value));
        }
        else {
            query.promise = query.promise.select(filters_1.buildFullName(args, query, tree.name.value) + " as " + tree.alias.value);
        }
    }
    if ((args === null || args === void 0 ? void 0 : args.sort) == 'desc' || (args === null || args === void 0 ? void 0 : args.sort) == 'asc')
        query.promise.orderBy(filters_1.buildFullName(args, query, tree.name.value), args === null || args === void 0 ? void 0 : args.sort);
    if (args === null || args === void 0 ? void 0 : args.limit)
        query.promise.limit(args === null || args === void 0 ? void 0 : args.limit);
    query.metrics.push(isInGetters ? (_e = tree.name) === null || _e === void 0 ? void 0 : _e.value : ((_f = tree.alias) === null || _f === void 0 ? void 0 : _f.value) || ((_g = tree.name) === null || _g === void 0 ? void 0 : _g.value));
}
function transformLinkedArgs(args, query) {
    if (args.from === '@') {
        args.from = query.table;
    }
    return args;
}
function parseDimension(tree, query, knex) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (Object.values(JoinType).includes(tree.name.value)) {
        return join(tree.name.value)(tree, query, knex);
    }
    var _h = query.dimensions, dimensions = _h === void 0 ? [] : _h;
    if (!query.groupIndex)
        query.groupIndex = 0;
    query.groupIndex++;
    var args = transformLinkedArgs(arguments_1.argumentsToObject(tree.arguments), query);
    if (args === null || args === void 0 ? void 0 : args.groupByEach) {
        var amount = parseFloat(args.groupByEach);
        query.getters = query.getters || [];
        query.promise = query.promise
            .select(knex.raw("(CAST(FLOOR(CEIL(??)/??) AS INT)*?? || '-' || CAST(FLOOR(CEIL(??)/??) AS INT)*??+??) AS ??", [
            filters_1.buildFullName(args, query, tree.name.value, false),
            amount,
            amount,
            filters_1.buildFullName(args, query, tree.name.value, false),
            amount,
            amount,
            amount - 1,
            ((_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value) || tree.name.value,
        ]), knex.raw("(CAST(FLOOR(CEIL(??)/??) AS INT)*??) AS ??", [
            filters_1.buildFullName(args, query, tree.name.value, false),
            amount,
            amount,
            "groupByEach_min_" + (((_b = tree.alias) === null || _b === void 0 ? void 0 : _b.value) || tree.name.value),
        ]), knex.raw("(CAST(FLOOR(CEIL(??)/??) AS INT)*??+??) AS ??", [
            filters_1.buildFullName(args, query, tree.name.value, false),
            amount,
            amount,
            amount - 1,
            "groupByEach_max_" + (((_c = tree.alias) === null || _c === void 0 ? void 0 : _c.value) || tree.name.value),
        ]))
            .groupBy(knex.raw('CAST(FLOOR(CEIL(??)/??) AS INT)', [
            filters_1.buildFullName(args, query, tree.name.value, false),
            amount,
        ]));
        query.getters.push("groupByEach_max_" + (((_d = tree.alias) === null || _d === void 0 ? void 0 : _d.value) || tree.name.value));
        query.getters.push("groupByEach_min_" + (((_e = tree.alias) === null || _e === void 0 ? void 0 : _e.value) || tree.name.value));
    }
    else if (args === null || args === void 0 ? void 0 : args.groupBy) {
        if (args.from !== query.table) {
            query.preparedAdvancedFilters = filters_1.parseAdvancedFilters(query, knex, query.advancedFilters, true);
        }
        var pre_trunc = filters_1.applyFilters(query, withFilters(query.filters)(knex
            .select([
            '*',
            knex.raw("date_trunc(?, ??) as ??", [
                args === null || args === void 0 ? void 0 : args.groupBy,
                tree.name.value,
                tree.name.value + "_" + (args === null || args === void 0 ? void 0 : args.groupBy),
            ]),
        ])
            .from(args.from || query.table)), knex);
        var table = args.groupByAlias || args.from || query.table;
        changeQueryTable(query, knex, table, true);
        query.promise = query.promise.from(pre_trunc.as(table));
        query.promise = query.promise.select(knex.raw("?? as ??", [
            tree.name.value + "_" + (args === null || args === void 0 ? void 0 : args.groupBy),
            ((_f = tree.alias) === null || _f === void 0 ? void 0 : _f.value) || tree.name.value,
        ]));
        query.promise = query.promise.groupBy(knex.raw("??", [tree.name.value + "_" + (args === null || args === void 0 ? void 0 : args.groupBy)]));
        if (!query.replaceWith)
            query.replaceWith = {};
        query.replaceWith[tree.name.value] = {
            value: tree.name.value + "_" + (args === null || args === void 0 ? void 0 : args.groupBy),
            index: query.groupIndex
        };
    }
    else {
        query.promise = query.promise.select(filters_1.buildFullName(args, query, tree.name.value, false));
        query.promise = query.promise.groupBy(filters_1.buildFullName(args, query, tree.name.value, false));
    }
    if (!!(args === null || args === void 0 ? void 0 : args.sort_desc))
        query.promise.orderBy(filters_1.buildFullName(args, query, args === null || args === void 0 ? void 0 : args.sort_desc), 'desc');
    if (!!(args === null || args === void 0 ? void 0 : args.sort_asc))
        query.promise.orderBy(filters_1.buildFullName(args, query, args === null || args === void 0 ? void 0 : args.sort_asc), 'asc');
    if (!!(args === null || args === void 0 ? void 0 : args.limit))
        query.promise.limit(args === null || args === void 0 ? void 0 : args.limit);
    if (!!(args === null || args === void 0 ? void 0 : args.offset))
        query.promise.offset(args === null || args === void 0 ? void 0 : args.offset);
    if (!!(args === null || args === void 0 ? void 0 : args.cutoff)) {
        query.promise.select(knex.raw("sum(??)/sum(sum(??)) over () as cutoff", [
            args === null || args === void 0 ? void 0 : args.cutoff,
            args === null || args === void 0 ? void 0 : args.cutoff,
        ]));
    }
    if (!!query.mutation) {
        dimensions.push(tree.name.value);
    }
    else {
        dimensions.push(((_g = tree.alias) === null || _g === void 0 ? void 0 : _g.value) || tree.name.value);
    }
    query.dimensions = dimensions;
}
// Need to thing about same structure of filters as in graphql
// filter: {
//   date: { between: { min: '2020-11-11', max: '2021-11-11' } },
//   age: { gt: 18, lt: 60, or: [{ between: { min: 14, max: 16 } }] },
//   brand: { like: 'Adidas*', and: [{ not: 'Adidas Originals' }, { not: 'Adidas New York'}] },
//   category: [1, 12, 24, 367890]
// }
// We can support it only in filter argument, so it will not affect older code
// Such filters we can combine and build easier
function parseFilters(tree, query, knex) {
    var args = tree.arguments;
    return transformFilters(args.concat({ name: { value: 'from' }, value: { value: query.table } }), query, knex);
}
var metricResolvers = {
    percentile: function (tree, query, knex) {
        if (!tree.arguments)
            throw 'Percentile function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Percentile function requires 'a' as argument";
        query.promise = query.promise.select(knex.raw("PERCENTILE_CONT(??) WITHIN GROUP(ORDER BY ??) AS ??", [
            parseFloat(args.factor) || 0.5,
            filters_1.buildFullName(args, query, args.a, false),
            tree.alias.value,
        ]));
        query.metrics.push(tree.alias.value);
    },
    sum: function (tree, query, knex) {
        if (!tree.arguments)
            throw 'Sum function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Sum function requires 'a' as argument";
        query.promise = query.promise.sum(filters_1.buildFullName(args, query, args.a, false) + " as " + tree.alias.value);
        query.metrics.push(tree.alias.value);
    },
    min: function (tree, query, knex) {
        if (!tree.arguments)
            throw 'Min function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Min function requires 'a' as argument";
        query.promise = query.promise.min(filters_1.buildFullName(args, query, args.a, false) + " as " + tree.alias.value);
        query.metrics.push(tree.alias.value);
    },
    max: function (tree, query, knex) {
        if (!tree.arguments)
            throw 'Max function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Max function requires 'a' as argument";
        query.promise = query.promise.max(filters_1.buildFullName(args, query, args.a, false) + " as " + tree.alias.value);
        query.metrics.push(tree.alias.value);
    },
    count: function (tree, query, knex) {
        if (!tree.arguments)
            throw 'Count function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Count function requires 'a' as argument";
        query.promise = query.promise.count(filters_1.buildFullName(args, query, args.a, false) + " as " + tree.alias.value);
        query.metrics.push(tree.alias.value);
    },
    countDistinct: function (tree, query, knex) {
        if (!tree.arguments)
            throw 'CountDistinct function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "CountDistinct function requires 'a' as argument";
        query.promise = query.promise.countDistinct(filters_1.buildFullName(args, query, args.a, false) + " as " + tree.alias.value);
        query.metrics.push(tree.alias.value);
    },
    join: join(JoinType.DEFAULT),
    leftJoin: join(JoinType.LEFT),
    rightJoin: join(JoinType.RIGHT),
    fullJoin: join(JoinType.FULL),
    innerJoin: join(JoinType.INNER),
    leftOuterJoin: join(JoinType.LEFT_OUTER),
    rightOuterJoin: join(JoinType.RIGHT_OUTER),
    fullOuterJoin: join(JoinType.FULL_OUTER),
    ranking: function (tree, query, knex) {
        var _a;
        if (!tree.arguments)
            throw 'Ranking function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Ranking function requires 'a' as argument";
        var partition = '';
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
        var promise = filters_1.applyFilters(query, withFilters(query.filters)(knex
            .select('*')
            .select(knex.raw(alg + "() over (" + partition + " ORDER BY ?? desc) as ??", [
            filters_1.buildFullName(args, query, args.a, false),
            tree.alias.value,
        ]))
            .from(query.table || args.from)), knex);
        var table = args.tableAlias || args.from || query.table;
        query.promise
            .select(filters_1.buildFullName({ from: table }, query, tree.alias.value, false))
            .from(promise.as(args.tableAlias || query.table));
        changeQueryTable(query, knex, table, true);
        query.promise.groupBy(filters_1.buildFullName({ from: table }, query, tree.alias.value, false));
        query.metrics.push(tree.alias.value);
    },
    searchRanking: function (tree, query, knex) {
        if (!tree.arguments)
            throw 'SearchRanking function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "SearchRanking function requires 'a' as argument";
        var key = filters_1.buildFullName({ from: args.from || query.table }, query, args.a, false);
        if (!query.search[key])
            throw "SearchRanking requires search query for " + key + " field";
        query.promise = query.promise.select(knex.raw("ts_rank(to_tsvector('simple', ??), (plainto_tsquery('simple', ?)::text || ':*')::tsquery) as ??", [key, query.search[key], tree.alias.value]));
    },
    searchHeadline: function (tree, query, knex) {
        if (!tree.arguments)
            throw 'SearchRanking function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "SearchHeadline function requires 'a' as argument";
        var key = filters_1.buildFullName({ from: args.from || query.table }, query, args.a, false);
        if (!query.search[key])
            throw "SearchHeadline requires search query for " + key + " field";
        query.promise = query.promise.select(knex.raw("ts_headline('simple', ??, (plainto_tsquery('simple', ?)::text || ':*')::tsquery) as ??", [key, query.search[key], tree.alias.value]));
    },
    unique: function (tree, query, knex) {
        var args = tree.arguments && arguments_1.argumentsToObject(tree.arguments);
        var field = filters_1.buildFullName(args, query, (args === null || args === void 0 ? void 0 : args.a) || tree.alias.value, false);
        query.promise = query.promise.select(field + " as " + tree.alias.value);
        query.promise = query.promise.groupBy(field);
        query.metrics.push(tree.alias.value);
    },
    from: function (tree, query, knex) {
        if (!tree.arguments)
            throw 'From function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.from)
            throw "From function requires 'from' as argument";
        var field = filters_1.buildFullName(args, query, (args === null || args === void 0 ? void 0 : args.a) || tree.alias.value, false);
        query.promise = query.promise.select(field + " as " + tree.alias.value);
        query.metrics.push(tree.alias.value);
    },
    avg: function (tree, query, knex) {
        //TODO: test
        if (!tree.arguments)
            throw 'Avg function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Avg function requires 'a' as argument";
        if (!!args.by) {
            query.promise.select(knex.raw("avg(??) over (partition by ??)::float4 as ??", [
                filters_1.buildFullName(args, query, args.a, false),
                filters_1.buildFullName(args, query, args.by, false),
                tree.alias.value,
            ]));
        }
        else {
            query.promise = query.promise.avg(filters_1.buildFullName(args, query, args.a, false) + " as " + tree.alias.value);
        }
        query.metrics.push(tree.alias.value);
    },
    avgPerDimension: function (tree, query, knex) {
        if (!tree.arguments)
            throw 'avgPerDimension function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "avgPerDimension function requires 'a' as argument";
        if (!args.per)
            throw "avgPerDimension function requires 'per' as argument";
        query.promise.select(knex.raw("sum(??)::float/COUNT(DISTINCT ??)::float4 as ??", [
            filters_1.buildFullName(args, query, args.a, false),
            filters_1.buildFullName(args, query, args.per, false),
            tree.alias.value,
        ]));
    },
    share: function (tree, query, knex) {
        var _a;
        if (!tree.arguments)
            throw 'Share function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Share  function requires 'a' as argument";
        var partition = '';
        if (!!args.by) {
            var partitionBy = filters_1.buildFullName(args, query, args.by, false);
            if ((_a = query.replaceWith) === null || _a === void 0 ? void 0 : _a[args.by]) {
                partitionBy = query.replaceWith[args.by].value;
            }
            partition = knex.raw("partition by ??", [partitionBy]);
        }
        query.promise = query.promise.select(knex.raw("sum(??)/NULLIF(sum(sum(??)) over (" + partition + "), 0)::float4 as ??", [
            filters_1.buildFullName(args, query, args.a, false),
            filters_1.buildFullName(args, query, args.a, false),
            tree.alias.value,
        ]));
        query.metrics.push(tree.alias.value);
    },
    indexed: function (tree, query, knex) {
        if (!tree.arguments)
            throw 'Share function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Share  function requires 'a' as argument";
        var partition = '';
        if (!!args.by)
            partition = knex.raw("partition by ??", [
                filters_1.buildFullName(args, query, args.by, false),
            ]);
        query.promise = query.promise.select(knex.raw("sum(??)/NULLIF(max(sum(??)::float) over (" + partition + "), 0)::float4 as ??", [
            filters_1.buildFullName(args, query, args.a, false),
            filters_1.buildFullName(args, query, args.a, false),
            tree.alias.value,
        ]));
        query.metrics.push(tree.alias.value);
    },
    divide: function (tree, query, knex) {
        if (!tree.arguments)
            throw 'Divide function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        var functions = Object.keys(args).reduce(function (r, k) {
            var fns = args[k].split('|');
            if (fns.length === 2) {
                args[k] = fns[1];
                r[k] = fns[0];
            }
            return r;
        }, { a: 'sum', by: 'sum' });
        if (!args.a)
            throw "Divide function requires 'a' as argument";
        if (!args.by)
            throw "Divide function requires 'by' as argument";
        query.promise = query.promise.select(knex.raw("cast(??(??) as float)/NULLIF(cast(??(??) as float), 0)::float4 as ??", [
            functions.a,
            filters_1.buildFullName(args, query, args.a, false),
            functions.by,
            filters_1.buildFullName(args, query, args.by, false),
            tree.alias.value,
        ]));
        query.metrics.push(tree.alias.value);
    },
    aggrAverage: function (tree, query, knex) {
        var _a;
        if (!tree.arguments)
            throw 'AggrAverage function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.to)
            throw "aggrAverage function requires 'to' as argument";
        if (!args.by)
            throw "aggrAverage function requires 'by' as argument";
        var internal = query.promise
            .select(filters_1.buildFullName(args, query, tree.alias.value, false))
            .sum(filters_1.buildFullName(args, query, args.to, false) + " as " + args.to)
            .sum(filters_1.buildFullName(args, query, args.by, false) + " as " + args.by)
            .select(knex.raw("?? * sum(??) as \"aggrAverage\"", [
            filters_1.buildFullName(args, query, tree.alias.value, false),
            filters_1.buildFullName(args, query, args.to, false),
        ]))
            .groupBy(filters_1.buildFullName(args, query, tree.alias.value, false));
        if (args.to !== args.by)
            internal = internal.sum(filters_1.buildFullName(args, query, args.by, false) + " as " + args.by);
        query.promise = knex
            .select(query.dimensions)
            .select(knex.raw("sum(\"aggrAverage\")/max(??)::float4  as \"" + ((_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value) + "_aggrAverage\"", [filters_1.buildFullName(args, query, args.by, false)]))
            .from(internal.as('middleTable'));
        if (!!query.dimensions && query.dimensions.length > 0) {
            query.promise = query.promise.groupBy(query.dimensions);
        }
    },
    weightAvg: function (tree, query, knex) {
        var _a;
        if (!tree.arguments)
            throw 'weightAvg function requires arguments';
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!args.a)
            throw "weightAvg function requires 'a' as argument";
        if (!args.by)
            throw "weightAvg function requires 'by' as argument";
        var internal = query.promise
            .select(filters_1.buildFullName(args, query, args.a, false))
            .sum(filters_1.buildFullName(args, query, args.by, false) + " as " + args.by)
            .select(knex.raw("?? * sum(??)::float4 as \"weightAvg\"", [
            filters_1.buildFullName(args, query, args.a, false),
            filters_1.buildFullName(args, query, args.by, false),
        ]))
            .groupBy(filters_1.buildFullName(args, query, args.a, false));
        query.promise = knex
            .select(query.dimensions)
            .select(knex.raw("sum(\"weightAvg\")/sum(??)::float4 as \"" + ((_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value) + "\"", [
            filters_1.buildFullName(args, query, args.by, false),
        ]))
            .from(internal.as('middleTable'));
        if (!!query.dimensions && query.dimensions.length > 0) {
            query.promise = query.promise.groupBy(query.dimensions);
        }
    },
    distinct: function (tree, query, knex) {
        query.promise = query.promise.distinct(filters_1.buildFullName((tree.arguments && arguments_1.argumentsToObject(tree.arguments)) || {}, query, tree.alias.value, false));
    }
};
var merge = function (tree, data, metricResolversData) {
    var queries = getMergeStrings(tree, undefined, undefined, metricResolversData);
    var mutations = queries.filter(function (q) { return !!q.mutation; });
    var batches = queries
        .filter(function (q) { return !q.mutation && !q.skipBatching; })
        .reduce(function (r, q, i) {
        var key = q.name || '___query';
        if (!r[key])
            r[key] = [];
        q.bid = i;
        r[key].push(q);
        return r;
    }, {});
    function getMergedObject(batches, quer, mutations, fullObject, originFullObject) {
        if (!!quer[0].skipMerge) {
            return quer.reduce(function (result, q) {
                result.push(data[q.bid]);
                return result;
            }, []);
        }
        if (!originFullObject) {
            originFullObject = fullObject;
        }
        return quer.reduce(function (result, q) {
            var resultData = data[q.bid];
            var _loop_1 = function () {
                var keys = Object.keys(resultData[j]);
                var _loop_2 = function () {
                    if (q.metrics[keys[key]]) {
                        var replacedPath_1 = progressive_1.replVars(q.metrics[keys[key]], resultData[j]).replace(/:join\./g, '');
                        var value_1 = resultData[j][keys[key]];
                        var skip_1 = false;
                        var skipAll_1 = false;
                        q.directives
                            .filter(function (directiveFunction) {
                            if (directiveFunction.context.on === 'metric') {
                                return directiveFunction.context.path === q.metrics[keys[key]];
                            }
                            else {
                                return q.metrics[keys[key]].startsWith(directiveFunction.context.path);
                            }
                        })
                            .forEach(function (directiveFunction) {
                            var path = q.metrics[keys[key]];
                            var _a = [
                                replacedPath_1.slice(0, replacedPath_1.lastIndexOf('.')),
                                path.slice(0, path.lastIndexOf('.')),
                                replacedPath_1.slice(replacedPath_1.lastIndexOf('.') + 1),
                            ], globalReplacedPath = _a[0], globalPath = _a[1], pathKey = _a[2];
                            var directiveResult = directiveFunction({
                                value: value_1,
                                originValue: resultData[j][keys[key]],
                                data: resultData[j],
                                path: path,
                                key: pathKey,
                                globalPath: globalPath,
                                globalReplacedPath: globalReplacedPath,
                                row: j,
                                replacedPath: replacedPath_1,
                                result: result,
                                fullObject: fullObject,
                                originFullObject: originFullObject,
                                queries: quer,
                                batches: batches,
                                q: q
                            });
                            // Important for directives which will not change value
                            if (directiveResult.hasOwnProperty('value')) {
                                value_1 = directiveResult.value;
                            }
                            if (directiveResult.skipAll) {
                                skipAll_1 = directiveResult.skipAll;
                            }
                            if (directiveResult.skip) {
                                skip_1 = directiveResult.skip;
                            }
                            if (directiveResult.path) {
                                replacedPath_1 = directiveResult.path;
                            }
                            if (directiveResult.replacers) {
                                Object.keys(directiveResult.replacers).forEach(function (k) {
                                    result = progressive_1.progressiveSet(result, replacedPath_1.slice(0, replacedPath_1.lastIndexOf('.')) +
                                        '.' +
                                        k, directiveResult.replacers[k], false, q.hashContext);
                                });
                            }
                        });
                        if (skipAll_1) {
                            j++;
                            return "break";
                        }
                        if (skip_1) {
                            return "continue";
                        }
                        if (!!mutations) {
                            if (mutations.skip) {
                                var checks_1 = mutations['skip'];
                                var skip_2 = Object.keys(checks_1).some(function (k) {
                                    //relying on pick by fix that
                                    return !checks_1[k](progressive_1.progressiveGet(fullObject[mutations.filters.by], progressive_1.replVars(k, resultData[j]), progressive_1.getBatchContext(batches, mutations.filters.by)));
                                });
                                if (skip_2)
                                    return "continue";
                            }
                        }
                        result = progressive_1.progressiveSet(result, replacedPath_1, value_1, false, q.hashContext);
                        if (!!mutations) {
                            if (mutations[mutations.mutationFunction] &&
                                mutations[mutations.mutationFunction][q.metrics[keys[key]]]) {
                                var mutation = mutations[mutations.mutationFunction];
                                result = progressive_1.progressiveSet(result, replacedPath_1, mutation[q.metrics[keys[key]]]({
                                    value: value_1,
                                    replacedPath: replacedPath_1,
                                    result: result,
                                    config: {
                                        metrics: q.metrics[keys[key]],
                                        resultData: resultData[j]
                                    },
                                    fullObject: fullObject
                                }), false, q.hashContext);
                                return "continue";
                            }
                        }
                    }
                };
                for (var key in keys) {
                    var state_1 = _loop_2();
                    if (state_1 === "break")
                        break;
                }
            };
            for (var j = 0; j < resultData.length; j++) {
                _loop_1();
            }
            return result;
        }, {});
    }
    if (Object.keys(batches).length === 1 && !!batches['___query']) {
        var merged = getMergedObject(batches, queries, null, null);
        if (Object.values(batches)[0].some(function (q) { var _a; return ((_a = q.directives) === null || _a === void 0 ? void 0 : _a.length) > 0; })) {
            return getMergedObject(batches, queries, null, merged);
        }
        else {
            return merged;
        }
    }
    var res = Object.keys(batches).reduce(function (r, k) {
        r[k.replace('___query', '')] = getMergedObject(batches, batches[k], null, null);
        return r;
    }, {});
    // When
    if (mutations.length > 0) {
        return mutations.reduce(function (r, mutation) {
            if (batches[mutation.name]) {
                r[mutation.name] = getMergedObject(batches, batches[mutation.name], mutation, r, res);
            }
            return r;
        }, lodash_1.cloneDeep(res));
    }
    else {
        return Object.keys(batches)
            .filter(function (k) { return batches[k].some(function (q) { var _a; return ((_a = q.directives) === null || _a === void 0 ? void 0 : _a.length) > 0; }); })
            .reduce(function (r, k) {
            r[k.replace('___query', '')] = getMergedObject(batches, batches[k], null, r, res);
            return r;
        }, lodash_1.cloneDeep(res));
    }
};
exports.merge = merge;
function getMergeStrings(tree, queries, idx, metricResolversData) {
    var _a, _b, _c, _d, _e, _f;
    if (queries === void 0) { queries = []; }
    if (idx === void 0) { idx = undefined; }
    if (!!~idx && idx !== undefined && !queries[idx])
        queries[idx] = { idx: idx, name: undefined };
    var query = queries[idx];
    if (query) {
        query.hashContext = {};
    }
    if (Array.isArray(tree)) {
        return tree.reduce(function (queries, t, i) {
            return getMergeStrings(t, queries, queries.length - 1, metricResolversData);
        }, queries);
    }
    if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
        return tree.selectionSet.selections.reduce(function (queries, t, i) {
            if (tree.operation === 'mutation') {
                queries.push({
                    idx: queries.length,
                    name: undefined,
                    mutation: true,
                    metrics: {},
                    path: ''
                });
            }
            else {
                queries.push({ idx: queries.length, name: undefined });
            }
            return getMergeStrings(t, queries, queries.length - 1, metricResolversData);
        }, queries);
    }
    if (tree.name.value === 'with') {
        query.skipBatching = true;
        return queries;
    }
    if (!query.filters &&
        (tree.name.value === 'fetch' || tree.name.value === 'fetchPlain')) {
        query.name = ((_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value) || null;
        query.metrics = {};
        query.path = '';
        if (tree.name.value === 'fetchPlain') {
            query.skipMerge = true;
        }
        if (!((_b = tree.selectionSet) === null || _b === void 0 ? void 0 : _b.selections))
            throw 'The query is empty, you need specify metrics or dimensions';
    }
    if (query.mutation && !query.filters) {
        query.filters = arguments_1.argumentsToObject(tree.arguments);
        query.name = ((_c = tree.alias) === null || _c === void 0 ? void 0 : _c.value) || null;
        query.mutationFunction = ((_d = tree.name) === null || _d === void 0 ? void 0 : _d.value) || null;
    }
    if (query.name === undefined && !query.mutation) {
        throw 'Cant find fetch in the payload';
    }
    if (!!((_e = tree.selectionSet) === null || _e === void 0 ? void 0 : _e.selections)) {
        var selections = tree.selectionSet.selections;
        var _g = selections.reduce(function (r, s) {
            return [r[0] || !!s.selectionSet, r[1] || !s.selectionSet];
        }, [false, false]), haveMetric_2 = _g[0], haveDimension_2 = _g[1];
        if (((_f = tree.name) === null || _f === void 0 ? void 0 : _f.value) !== 'fetch' && tree.name.value !== 'fetchPlain')
            mergeDimension(tree, query);
        selections.sort(function (a, b) { return (!b.selectionSet ? -1 : 1); });
        return selections.reduce(function (queries, t, i) {
            if (!!t.selectionSet && haveMetric_2 && haveDimension_2) {
                var newIdx = queries.length;
                queries[newIdx] = __assign(__assign({}, queries[idx]), { metrics: {} });
                queries[newIdx].path = query.path + '';
                queries[newIdx].idx = newIdx;
                return getMergeStrings(t, queries, newIdx, metricResolversData);
            }
            return getMergeStrings(t, queries, idx, metricResolversData);
        }, queries);
    }
    mergeMetric(tree, query, metricResolversData);
    return queries;
}
function mergeMetric(tree, query, metricResolversData) {
    var _a, _b, _c, _d;
    var name = ((_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value) || tree.name.value;
    var fieldName = tree.name.value;
    var isInGetters = (_b = query.getters) === null || _b === void 0 ? void 0 : _b.find(function (name) { return name === fieldName; });
    var args = arguments_1.argumentsToObject(tree.arguments);
    if ((args === null || args === void 0 ? void 0 : args.type) === 'Array') {
        query.path += (!!query.path ? '.' : '') + "[@" + name + "=:" + name + "]";
        query.metrics["" + (isInGetters ? fieldName : name)] = "" + query.path + (!!query.path ? '.' : '') + name;
        return directives_1.parseDirective(tree, query, 'metric', query.metrics["" + name]);
    }
    else {
        if (!!query.mutation)
            return metricResolversData[query.mutationFunction](tree, query);
        if (tree.alias && metricResolversData[(_c = tree.name) === null || _c === void 0 ? void 0 : _c.value])
            return metricResolversData[(_d = tree.name) === null || _d === void 0 ? void 0 : _d.value](tree, query);
        query.metrics["" + (isInGetters ? fieldName : name)] = "" + query.path + (!!query.path ? '.' : '') + name;
        return directives_1.parseDirective(tree, query, 'metric', query.metrics["" + name]);
    }
}
function mergeDimension(tree, query) {
    var _a, _b, _c;
    var args = arguments_1.argumentsToObject(tree.arguments);
    query.getters = query.getters || [];
    if (args === null || args === void 0 ? void 0 : args.groupByEach) {
        query.getters.push("groupByEach_max_" + (((_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value) || tree.name.value));
        query.getters.push("groupByEach_min_" + (((_b = tree.alias) === null || _b === void 0 ? void 0 : _b.value) || tree.name.value));
    }
    var name = !!query.mutation
        ? tree.name.value
        : ((_c = tree.alias) === null || _c === void 0 ? void 0 : _c.value) || tree.name.value;
    if ((args === null || args === void 0 ? void 0 : args.type) === 'Array') {
        if (!!(args === null || args === void 0 ? void 0 : args.cutoff)) {
            query.cutoff = "" + query.path + (!!query.path ? '.' : '') + "[@" + name + "=:" + name + "]";
        }
        query.path += (!!query.path ? '.' : '') + "[@" + name + "=:" + name + "]";
        return directives_1.parseDirective(tree, query, 'dimension');
    }
    else {
        query.path += (!!query.path ? '.' : '') + ":" + name;
        return directives_1.parseDirective(tree, query, 'dimension');
    }
}
var comparisonFunction = {
    gt: function (v) { return function (x) { return +x > +v; }; },
    lt: function (v) { return function (x) { return +x < +v; }; },
    gte: function (v) { return function (x) { return +x >= +v; }; },
    lte: function (v) { return function (x) { return +x <= +v; }; },
    eq: function (v) { return function (x) { return x == v; }; }
};
var metricResolversData = {
    aggrAverage: function (tree, query) {
        var _a;
        var name = ((_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value) + "_aggrAverage";
        query.metrics["" + name] = "" + query.path + (!!query.path ? '.' : '') + name;
    },
    weightAvg: function (tree, query) {
        var _a;
        var name = "" + ((_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value);
        query.metrics["" + name] = "" + query.path + (!!query.path ? '.' : '') + name;
    },
    pick: function (tree, query) {
        var _a;
        var name = "" + ((_a = tree.name) === null || _a === void 0 ? void 0 : _a.value);
        var args = arguments_1.argumentsToObject(tree.arguments);
        if (!query.skip)
            query.skip = {};
        if (query.path === ':pick')
            query.path = '';
        Object.keys(args).map(function (key) {
            var _a = key.split('_'), keyName = _a[0], operator = _a[1];
            query.skip["" + query.path + (!!query.path ? '.' : '') + ":" + name + "." + keyName] =
                comparisonFunction[operator || 'eq'](args[key]);
        });
    },
    diff: function (tree, query) {
        var _a;
        var name = "" + ((_a = tree.name) === null || _a === void 0 ? void 0 : _a.value);
        if (!query.diff)
            query.diff = {};
        if (query.path.startsWith(':diff') || query.path.startsWith(':diff.'))
            query.path = query.path.replace(/:diff\.?/, '');
        query.diff["" + query.path + (!!query.path ? '.' : '') + name] = function (_a) {
            var value = _a.value, replacedPath = _a.replacedPath, fullObject = _a.fullObject;
            return (value / progressive_1.progressiveGet(fullObject[query.filters.by], replacedPath) - 1);
        };
    },
    divideBy: function (tree, query) {
        var _a;
        var name = "" + ((_a = tree.name) === null || _a === void 0 ? void 0 : _a.value);
        if (!query.divideBy)
            query.divideBy = {};
        if (query.path.startsWith(':divideBy') ||
            query.path.startsWith(':divideBy.'))
            query.path = query.path.replace(/:divideBy\.?/, '');
        query.divideBy["" + query.path + (!!query.path ? '.' : '') + name] = function (_a) {
            var value = _a.value, replacedPath = _a.replacedPath, fullObject = _a.fullObject;
            return value / progressive_1.progressiveGet(fullObject[query.filters.by], replacedPath);
        };
    },
    blank: function (tree, query) {
        var _a;
        var name = ((_a = tree.name) === null || _a === void 0 ? void 0 : _a.value) + " ";
        if (!query.skip)
            query.skip = {};
        if (query.path.startsWith(':blank.') || query.path.startsWith(':blank'))
            query.path = query.path.replace(/:blank\.?/, '');
        query.skip[query.path + " " + (!!query.path ? '.' : '') + ": " + name + " "] = function (x) {
            return false;
        };
    }
};
function withFilters(filters) {
    return function (knexPipe) {
        return filters.reduce(function (knexNext, filter, i) {
            var selector = filter[1] === 'in' ? 'whereIn' : i === 0 ? 'where' : 'andWhere';
            return knexNext[selector].apply(knexNext, filter[1] === 'in'
                ? filter.filter(function (a) { return a !== 'in'; })
                : filter[1] === 'search'
                    ? [
                        knexNext.raw("to_tsvector('simple', ??) @@ (plainto_tsquery('simple', ?)::text || ':*')::tsquery)", [filter[0], filter[2]]),
                    ]
                    : filter);
        }, knexPipe);
    };
}
/*

query ecom_benchmarking{
    fetch(category: "Adult", countryisocode: US) {
        devicecategory {
            date(type:Array){
                averageSessions:sum(a:sessions)
                averageBounces:sum(a:bounces)
            }

        }
    }
}


query TEMP_BRAND_BASKET_POSITION_TABLE{
  fetch(brand: adidas, country: us){
    ... position1 {
      result: divide(a:position1.POSITION1_BASKETS, by:no_of_baskets)
    }
  }
  position1: fetch(brand: adidas, country: us, position: 1) {
    POSITION1_BASKETS: SUM(a: no_of_baskets)
  }
}

query TEMP_BRAND_BASKET_POSITION_TABLE{
  fetch(brand: adidas, country: us){
    brand_2 {
      ... overal {
        brandIntesections: divide(a:no_of_baskets, by:position1.no_of_all_baskets)
      }
    }
  }
}
query brand1_table{
  overal: fetch(brand: adidas, country: us){
    no_of_all_baskets
  }
}
*/
