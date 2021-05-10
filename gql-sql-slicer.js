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
var knexConstructor = require('knex');
var gqlToDb = function (opts) {
    if (opts === void 0) { opts = { client: 'pg' }; }
    var knex = knexConstructor(opts);
    var beforeDbHandler = function (r) { return Promise.resolve(r); };
    var dbHandler = function (_a) {
        var queries = _a.queries;
        return Promise.all(queries.map(function (q) { return q.promise; }));
    };
    var gqlFetch = function (gqlQuery) { return __awaiter(void 0, void 0, void 0, function () {
        var definitions, queries, sql, preparedGqlQuery, resultFromDb, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    definitions = gql(gqlQuery).definitions;
                    queries = queryBuilder(null, definitions, undefined, undefined, knex).filter(function (q) { return !q.skip; });
                    sql = queries.map(function (q) { return q.promise.toString(); });
                    return [4 /*yield*/, beforeDbHandler({ queries: queries, sql: sql, definitions: definitions })];
                case 1:
                    preparedGqlQuery = _a.sent();
                    if (!preparedGqlQuery)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, dbHandler(preparedGqlQuery)];
                case 2:
                    resultFromDb = _a.sent();
                    if (!resultFromDb)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, exports.merge(definitions, resultFromDb)];
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
    return gqlFetch;
};
exports.gqlToDb = gqlToDb;
function queryBuilder(table, tree, queries, idx, knex) {
    var _a, _b, _c, _d, _e, _f;
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
        return tree.reduce(function (queries, t, i) { return queryBuilder(table, t, queries, queries.length - 1, knex); }, queries);
    }
    if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
        if (tree.operation === 'query' && !!((_a = tree.name) === null || _a === void 0 ? void 0 : _a.value))
            table = (_b = tree.name) === null || _b === void 0 ? void 0 : _b.value;
        if (tree.operation === 'mutation')
            return queries;
        return tree.selectionSet.selections.reduce(function (queries, t, i) { return queryBuilder(table, t, queries, queries.length, knex); }, queries);
    }
    if (!query.filters && tree.name.value === 'fetch') {
        query.name = ((_c = tree.alias) === null || _c === void 0 ? void 0 : _c.value) || null;
        query.table = table;
        query.filters = parseFilters(tree);
        query.promise = knex.select().from(table);
        //if(filters)
        query.promise = withFilters(query.filters)(query.promise);
        if (!((_d = tree.selectionSet) === null || _d === void 0 ? void 0 : _d.selections))
            throw "The query is empty, you need specify metrics or dimensions";
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
                queries[newIdx].promise = copyKnex(query.promise, knex);
                queries[newIdx].idx = newIdx;
                return queryBuilder(table, t, queries, newIdx, knex);
            }
            return queryBuilder(table, t, queries, idx, knex);
        }, queries);
    }
    parseMetric(tree, query, knex);
    return queries;
}
function parseMetric(tree, query, knex) {
    var _a, _b, _c;
    var _d = query.metrics, metrics = _d === void 0 ? [] : _d;
    if (tree.alias && metricResolvers[(_a = tree.name) === null || _a === void 0 ? void 0 : _a.value])
        return metricResolvers[(_b = tree.name) === null || _b === void 0 ? void 0 : _b.value](tree, query, knex);
    if (!((_c = tree.alias) === null || _c === void 0 ? void 0 : _c.value)) {
        query.promise = query.promise.select("" + tree.name.value);
    }
    else {
        query.promise = query.promise.select(tree.name.value + " as " + tree.alias.value);
    }
    metrics.push(tree.name.value);
    query.metrics = metrics;
}
function parseDimension(tree, query, knex) {
    var _a = query.dimensions, dimensions = _a === void 0 ? [] : _a;
    var args = argumentsToObject(tree.arguments);
    if (args === null || args === void 0 ? void 0 : args.groupBy) {
        query.promise = query.promise.select(knex.raw("date_trunc(?, ??) as ??", [args === null || args === void 0 ? void 0 : args.groupBy, tree.name.value, tree.name.value]));
        query.promise = query.promise.groupBy(1);
    }
    else {
        query.promise = query.promise.select(tree.name.value);
        query.promise = query.promise.groupBy(tree.name.value);
    }
    if (!!(args === null || args === void 0 ? void 0 : args.sort_desc))
        query.promise.orderBy(args === null || args === void 0 ? void 0 : args.sort_desc, 'desc');
    if (!!(args === null || args === void 0 ? void 0 : args.sort_asc))
        query.promise.orderBy(args === null || args === void 0 ? void 0 : args.sort_asc, 'asc');
    if (!!(args === null || args === void 0 ? void 0 : args.limit))
        query.promise.limit(args === null || args === void 0 ? void 0 : args.limit);
    if (!!(args === null || args === void 0 ? void 0 : args.offset))
        query.promise.offset(args === null || args === void 0 ? void 0 : args.offset);
    if (!!(args === null || args === void 0 ? void 0 : args.cutoff)) {
        query.promise.select(knex.raw("sum(??)/sum(sum(??)) over () as cutoff", [args === null || args === void 0 ? void 0 : args.cutoff, args === null || args === void 0 ? void 0 : args.cutoff]));
    }
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
var metricResolvers = {
    sum: function (tree, query, knex) {
        if (!tree.arguments)
            throw "Sum function requires arguments";
        var args = argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Sum function requires 'a' as argument";
        query.promise = query.promise.sum(args.a + " as " + tree.alias.value);
    },
    share: function (tree, query, knex) {
        if (!tree.arguments)
            throw "Share function requires arguments";
        var args = argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Share  function requires 'a' as argument";
        var partition = '';
        if (!!args.by)
            partition = knex.raw("partition by ??", [args.by]);
        query.promise = query.promise.select(knex.raw("sum(??)/NULLIF(sum(sum(??)) over (" + partition + "), 0) as ??", [args.a, args.a, tree.alias.value]));
    },
    indexed: function (tree, query, knex) {
        if (!tree.arguments)
            throw "Share function requires arguments";
        var args = argumentsToObject(tree.arguments);
        if (!args.a)
            throw "Share  function requires 'a' as argument";
        var partition = '';
        if (!!args.by)
            partition = knex.raw("partition by ??", [args.by]);
        query.promise = query.promise.select(knex.raw("sum(??)/NULLIF(max(sum(??)::float) over (" + partition + "), 0) as ??", [args.a, args.a, tree.alias.value]));
    },
    divide: function (tree, query, knex) {
        if (!tree.arguments)
            throw "Divide function requires arguments";
        var args = argumentsToObject(tree.arguments);
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
        query.promise = query.promise.select(knex.raw("cast(??(??) as float)/NULLIF(cast(??(??) as float), 0) as ??", [functions.a, args.a, functions.by, args.by, tree.alias.value]));
    },
    aggrAverage: function (tree, query, knex) {
        var _a, _b, _c;
        if (!tree.arguments)
            throw "AggrAverage function requires arguments";
        var args = argumentsToObject(tree.arguments);
        if (!args.to)
            throw "aggrAverage function requires 'to' as argument";
        if (!args.by)
            throw "aggrAverage function requires 'by' as argument";
        var internal = query.promise.select(tree.alias.value)
            .sum(args.to + " as " + args.to)
            .sum(args.by + " as " + args.by)
            .select(knex.raw("?? * sum(??) as \"aggrAverage\"", [(_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value, args.to]))
            .groupBy((_b = tree.alias) === null || _b === void 0 ? void 0 : _b.value);
        if (args.to !== args.by)
            internal = internal.sum(args.by + " as " + args.by);
        query.promise = knex.select(query.dimensions)
            .select(knex.raw("sum(\"aggrAverage\")/max(??) as \"" + ((_c = tree.alias) === null || _c === void 0 ? void 0 : _c.value) + "_aggrAverage\"", [args.by]))
            .from(internal.as('middleTable'));
        if (!!query.dimensions && query.dimensions.length > 0) {
            query.promise = query.promise.groupBy(query.dimensions);
        }
    },
    weightAvg: function (tree, query, knex) {
        var _a;
        if (!tree.arguments)
            throw "weightAvg function requires arguments";
        var args = argumentsToObject(tree.arguments);
        if (!args.a)
            throw "weightAvg function requires 'a' as argument";
        if (!args.by)
            throw "weightAvg function requires 'by' as argument";
        var internal = query.promise.select(args.a)
            .sum(args.by + " as " + args.by)
            .select(knex.raw("?? * sum(??) as \"weightAvg\"", [args.a, args.by]))
            .groupBy(args.a);
        query.promise = knex.select(query.dimensions)
            .select(knex.raw("sum(\"weightAvg\")/sum(??) as \"" + ((_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value) + "\"", [args.by]))
            .from(internal.as('middleTable'));
        if (!!query.dimensions && query.dimensions.length > 0) {
            query.promise = query.promise.groupBy(query.dimensions);
        }
    },
    distinct: function (tree, query, knex) {
        query.promise = query.promise.distinct(tree.alias.value);
    }
};
function copyKnex(knexObject, knex) {
    var result = knex(knexObject._single.table);
    return Object.keys(knexObject).reduce(function (k, key) {
        if (key.startsWith("_") && !!knexObject[key]) {
            k[key] = JSON.parse(JSON.stringify(knexObject[key]));
        }
        return k;
    }, result);
}
var merge = function (tree, data) {
    var queries = getMergeStrings(tree);
    var mutations = queries.filter(function (q) { return !!q.mutation; }).reduce(function (result, query) {
        result[query.filters.from] = query;
        return result;
    }, {});
    var batches = queries.filter(function (q) { return !q.mutation; }).reduce(function (r, q, i) {
        var key = q.name || "___query";
        if (!r[key])
            r[key] = [];
        q.bid = i;
        r[key].push(q);
        return r;
    }, {});
    function getMergedObject(quer, mutations, fullObject) {
        return quer.reduce(function (result, q, i) {
            var resultData = data[q.bid];
            var skipArray = [];
            for (var j = 0; j < resultData.length; j++) {
                var keys = Object.keys(resultData[j]);
                var _loop_1 = function () {
                    //todo: rm
                    if (keys[key] === 'cutoff' && +resultData[j][keys[key]] < 0.005) {
                        skipArray.push(replVars(q.cutoff, resultData[j]));
                    }
                    if (q.metrics[keys[key]]) {
                        var replacedPath = replVars(q.metrics[keys[key]], resultData[j]);
                        var valueDir = replacedPath.slice(0, -(keys[key].length + 1));
                        //todo: rm
                        if (skipArray.includes(valueDir))
                            return "continue";
                        var value = isNaN(+resultData[j][keys[key]]) ? resultData[j][keys[key]] : +resultData[j][keys[key]];
                        if (mutations) {
                            var checks_1 = mutations[mutations.mutationFunction];
                            var skip = Object.keys(checks_1).reduce(function (r, k) {
                                if (r)
                                    return r;
                                return !checks_1[k](progressiveGet(fullObject[mutations.filters.by], replVars(k, resultData[j])));
                            }, false);
                            if (skip)
                                return "continue";
                        }
                        result = progressiveSet(result, replacedPath, value);
                    }
                };
                for (var key in keys) {
                    _loop_1();
                }
            }
            return result;
        }, {});
    }
    if (Object.keys(batches).length === 1 && !!batches["___query"]) {
        return getMergedObject(queries, null, null);
    }
    var res = Object.keys(batches).reduce(function (r, k) {
        r[k.replace('___query', '')] = getMergedObject(batches[k], null, null);
        if (mutations[k])
            r[mutations[k].name] = getMergedObject(batches[k], mutations[k], r);
        return r;
    }, {});
    return res;
};
exports.merge = merge;
function replVars(str, obj) {
    var keys = Object.keys(obj);
    for (var key in keys) {
        str = str.replace(":" + keys[key], shieldSeparator(obj[keys[key]]));
    }
    return str;
}
function shieldSeparator(str) {
    if (typeof (str) !== 'string')
        return str;
    return str.replace(/\./g, "$#@#");
}
function unshieldSeparator(str) {
    if (typeof (str) !== 'string')
        return str;
    return str.replace(/\$#@#/, '.');
}
function getMergeStrings(tree, queries, idx) {
    var _a, _b, _c, _d, _e, _f;
    if (queries === void 0) { queries = []; }
    if (idx === void 0) { idx = undefined; }
    if (!!~idx && idx !== undefined && !queries[idx])
        queries[idx] = { idx: idx, name: undefined };
    var query = queries[idx];
    if (Array.isArray(tree)) {
        return tree.reduce(function (queries, t, i) { return getMergeStrings(t, queries, queries.length - 1); }, queries);
    }
    if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
        return tree.selectionSet.selections.reduce(function (queries, t, i) {
            if (tree.operation === 'mutation') {
                queries.push({ idx: queries.length, name: undefined, mutation: true, metrics: {}, path: '' });
            }
            else {
                queries.push({ idx: queries.length, name: undefined });
            }
            return getMergeStrings(t, queries, queries.length - 1);
        }, queries);
    }
    if (!query.filters && tree.name.value === 'fetch') {
        query.name = ((_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value) || null;
        query.metrics = {};
        query.path = '';
        if (!((_b = tree.selectionSet) === null || _b === void 0 ? void 0 : _b.selections))
            throw "The query is empty, you need specify metrics or dimensions";
    }
    if (query.mutation && !query.filters) {
        query.filters = argumentsToObject(tree.arguments);
        query.name = ((_c = tree.alias) === null || _c === void 0 ? void 0 : _c.value) || null;
        query.mutationFunction = ((_d = tree.name) === null || _d === void 0 ? void 0 : _d.value) || null;
    }
    if (query.name === undefined && !query.mutation)
        throw "Cant find fetch in the payload";
    if (!!((_e = tree.selectionSet) === null || _e === void 0 ? void 0 : _e.selections)) {
        var selections = tree.selectionSet.selections;
        var _g = selections.reduce(function (r, s) {
            return [r[0] || !!s.selectionSet, r[1] || !s.selectionSet];
        }, [false, false]), haveMetric_2 = _g[0], haveDimension_2 = _g[1];
        if (((_f = tree.name) === null || _f === void 0 ? void 0 : _f.value) !== 'fetch')
            mergeDimension(tree, query);
        selections.sort(function (a, b) { return !b.selectionSet ? -1 : 1; });
        return selections.reduce(function (queries, t, i) {
            if (!!t.selectionSet && haveMetric_2 && haveDimension_2) {
                var newIdx = queries.length;
                queries[newIdx] = __assign(__assign({}, queries[idx]), { metrics: {} });
                queries[newIdx].path = query.path + '';
                queries[newIdx].idx = newIdx;
                return getMergeStrings(t, queries, newIdx);
            }
            return getMergeStrings(t, queries, idx);
        }, queries);
    }
    mergeMetric(tree, query);
    return queries;
}
function mergeMetric(tree, query) {
    var _a, _b, _c, _d, _e, _f;
    var name = tree.name.value;
    var args = argumentsToObject(tree.arguments);
    if ((args === null || args === void 0 ? void 0 : args.type) === 'Array') {
        if ((_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value)
            name = (_b = tree.alias) === null || _b === void 0 ? void 0 : _b.value;
        query.path += (!!query.path ? '.' : '') + "[@" + name + "=:" + name + "]";
        query.metrics["" + name] = "" + query.path + (!!query.path ? '.' : '') + name;
    }
    else {
        if (!!query.mutation)
            return metricResolversData[query.mutationFunction](tree, query);
        if (tree.alias && metricResolversData[(_c = tree.name) === null || _c === void 0 ? void 0 : _c.value])
            return metricResolversData[(_d = tree.name) === null || _d === void 0 ? void 0 : _d.value](tree, query);
        if ((_e = tree.alias) === null || _e === void 0 ? void 0 : _e.value)
            name = (_f = tree.alias) === null || _f === void 0 ? void 0 : _f.value;
        query.metrics["" + name] = "" + query.path + (!!query.path ? '.' : '') + name;
    }
}
function mergeDimension(tree, query) {
    var args = argumentsToObject(tree.arguments);
    if ((args === null || args === void 0 ? void 0 : args.type) === 'Array') {
        if (!!(args === null || args === void 0 ? void 0 : args.cutoff)) {
            query.cutoff = "" + query.path + (!!query.path ? '.' : '') + "[@" + tree.name.value + "=:" + tree.name.value + "]";
        }
        query.path += (!!query.path ? '.' : '') + "[@" + tree.name.value + "=:" + tree.name.value + "]";
    }
    else {
        query.path += (!!query.path ? '.' : '') + ":" + tree.name.value;
    }
}
var comparisonFunction = {
    'gt': function (v) { return function (x) { return +x > +v; }; },
    'lt': function (v) { return function (x) { return +x < +v; }; },
    'gte': function (v) { return function (x) { return +x >= +v; }; },
    'lte': function (v) { return function (x) { return +x <= +v; }; }
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
        var args = argumentsToObject(tree.arguments);
        if (!query.pick)
            query.pick = {};
        if (query.path === ':pick')
            query.path = '';
        Object.keys(args).map(function (key) {
            var _a = key.split('_'), keyName = _a[0], operator = _a[1];
            query.pick["" + query.path + (!!query.path ? '.' : '') + ":" + name + "." + keyName] = comparisonFunction[operator](args[key]);
        });
    }
};
/*
var k = {};
progressiveSet(k, 'book.test.one', 1)
progressiveSet(k, 'book.two.one', 3)
progressiveSet(k, 'book.dumbo.[].one', 3)
progressiveSet(k, 'book.dumbo.[].twenty', 434)
progressiveSet(k, 'book.dumbo.[].second', '3dqd25')
progressiveSet(k, 'book.dumbo.[1].leela', 'fry')
progressiveSet(k, 'book.dumbo.[@one=3].leela', 'fry')
console.log(JSON.stringify(k))
*/
function progressiveGet(object, queryPath) {
    var pathArray = queryPath.split(/\./).map(function (p) { return unshieldSeparator(p); });
    return pathArray.reduce(function (r, pathStep, i) {
        if (Array.isArray(r)) {
            return r.find(function (o) { return Object.values(o).includes(pathStep); });
        }
        if (!r)
            return NaN;
        return r[pathStep];
    }, object);
}
function progressiveSet(object, queryPath, value) {
    var pathArray = queryPath.split(/\./).map(function (p) { return unshieldSeparator(p); });
    var property = pathArray.splice(-1);
    if (queryPath.startsWith("[") && !Array.isArray(object) && Object.keys(object).length === 0)
        object = [];
    var leaf = object;
    pathArray.forEach(function (pathStep, i) {
        var _a;
        if (pathStep.startsWith('[') && !Array.isArray(leaf)) {
            var key = pathStep.slice(1, pathStep.length - 1);
            if (key !== 0 && !key || Number.isInteger(+key)) {
                leaf['arr'] = [];
                leaf = leaf['arr'];
            }
            else if (key.startsWith("@")) {
                key = key.slice(1);
                var filterBy = key.split('=');
                if (!leaf[filterBy[0]])
                    leaf[filterBy[0]] = [];
                leaf = leaf[filterBy[0]];
            }
        }
        if (Array.isArray(leaf)) {
            var key = pathStep.slice(1, pathStep.length - 1);
            if (key !== 0 && !key) {
                leaf.push({});
                leaf = leaf[leaf.length - 1];
            }
            else if (Number.isInteger(+key)) {
                leaf = leaf[+key];
            }
            else if (key.startsWith("@")) {
                key = key.slice(1);
                var filterBy_1 = key.split('=');
                var found = leaf.find(function (a) { return a[filterBy_1[0]] == ('' + filterBy_1[1]); });
                if (!!found) {
                    leaf = found;
                }
                else {
                    leaf.push((_a = {}, _a[filterBy_1[0]] = filterBy_1[1], _a));
                    leaf = leaf[leaf.length - 1];
                }
            }
        }
        else {
            var nextStep = pathArray[i + 1];
            if (!!nextStep && nextStep.startsWith('[') && nextStep.endsWith(']') && !leaf[pathStep]) {
                leaf[pathStep] = [];
            }
            if (!leaf[pathStep])
                leaf[pathStep] = {}; //todo guess if there should be an array
            leaf = leaf[pathStep];
        }
    });
    leaf[property] = value;
    return object;
}
function withFilters(filters) {
    return function (knexPipe) {
        return filters.reduce(function (knexNext, filter, i) {
            if (i === 0) {
                if (filter[1] === 'in')
                    return knexNext.whereIn.apply(knexNext, filter.filter(function (a) { return a !== 'in'; }));
                return knexNext.where.apply(knexNext, filter);
            }
            if (filter[1] === 'in')
                return knexNext.whereIn.apply(knexNext, filter.filter(function (a) { return a !== 'in'; }));
            return knexNext.andWhere.apply(knexNext, filter);
        }, knexPipe);
    };
}
function flattenObject(o) {
    var keys = Object.keys(o);
    return keys.length === 1 ? o[keys[0]] : keys.map(function (k) { return o[k]; });
}
function argumentsToObject(args) {
    if (!args)
        return null;
    return args.reduce(function (r, a) {
        var _a;
        return (__assign(__assign({}, r), (_a = {}, _a[a.name.value] = a.value.value, _a)));
    }, {});
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
