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
var arguments_1 = require("./arguments");
var directives_1 = require("./directives");
var gql_ga_slicer_1 = require("./gql-ga-slicer");
var progressive_1 = require("./progressive");
var lodash_1 = require("lodash");
var filters_1 = require("./filters");
var metrics_1 = require("./metrics");
var parser_1 = require("./parser");
var dimensions_1 = require("./dimensions");
var providers_1 = require("./providers");
var mergeDeep = require('deepmerge');
var gqlToDb = function () {
    var beforeDbHandler = function (r) { return Promise.resolve(r); };
    var dbHandler = function (_a) {
        var queries = _a.queries;
        return Promise.all(queries.map(function (q) {
            return q.providers[q.provider].execute(q.providers[q.provider].connection, q.promise.toSQL());
        }));
    };
    var afterDbHandler = function (r) { return Promise.resolve(r); };
    var customMetricResolvers = {};
    var customMetricDataResolvers = {};
    var customDimensionResolvers = {};
    var definedProviders = __assign({}, providers_1.providers);
    var gqlFetch = function (gqlQuery, provider) { return __awaiter(void 0, void 0, void 0, function () {
        var knex, definitions, queries, sql, preparedGqlQuery, resultFromDb, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    knex = definedProviders[provider || 'pg'].client
                        ? knexConstructor({
                            client: definedProviders[provider || 'pg'].client
                        })
                        : knexConstructor({});
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    definitions = gql(gqlQuery).definitions;
                    queries = queryBuilder(null, definitions, undefined, undefined, knex, __assign(__assign({}, metrics_1.metricResolvers), customMetricResolvers), __assign(__assign({}, dimensions_1.dimensionResolvers), customDimensionResolvers), definedProviders, provider || 'pg')
                        .filter(function (q) { return !q.skip; })
                        .map(function (q) {
                        q.promise = filters_1.applyFilters(q, q.promise, knex);
                        return q;
                    });
                    sql = queries
                        .filter(function (q) { return !q.isWith; })
                        .map(function (q) { return q.promise.toString(); });
                    return [4 /*yield*/, beforeDbHandler({
                            queries: queries.filter(function (q) { return !q.isWith; }),
                            sql: sql,
                            definitions: definitions
                        })];
                case 2:
                    preparedGqlQuery = _a.sent();
                    if (!preparedGqlQuery)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, dbHandler(preparedGqlQuery)];
                case 3:
                    resultFromDb = _a.sent();
                    if (!resultFromDb)
                        return [2 /*return*/, null];
                    afterDbHandler(definitions, resultFromDb);
                    return [4 /*yield*/, exports.merge(definitions, resultFromDb, __assign(__assign({}, metricResolversData), customMetricDataResolvers))];
                case 4: return [2 /*return*/, _a.sent()];
                case 5:
                    e_1 = _a.sent();
                    console.log(e_1);
                    throw Error(e_1);
                case 6: return [2 /*return*/];
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
    gqlFetch.afterDbFetch = function (fn) {
        afterDbHandler = fn;
        return gqlFetch;
    };
    gqlFetch.useResolver = function (name, fn) {
        var _a;
        customMetricResolvers = __assign(__assign({}, customMetricResolvers), (_a = {}, _a[name] = fn, _a));
    };
    gqlFetch.useDimensionResolver = function (name, fn) {
        var _a;
        customDimensionResolvers = __assign(__assign({}, customDimensionResolvers), (_a = {}, _a[name] = fn, _a));
    };
    gqlFetch.useProvider = function (name, provider) {
        var _a;
        definedProviders = mergeDeep(definedProviders, (_a = {}, _a[name] = provider, _a));
    };
    gqlFetch.useDataResolver = function (name, fn) {
        var _a;
        customMetricDataResolvers = __assign(__assign({}, customMetricDataResolvers), (_a = {}, _a[name] = fn, _a));
    };
    gqlFetch.setupProvider = function (name, configuration) {
        definedProviders[name] = __assign(__assign({}, definedProviders[name]), { configuration: configuration, connection: definedProviders[name].getConnection(configuration, definedProviders[name].getConnector()) });
    };
    return gqlFetch;
};
exports.gqlToDb = gqlToDb;
function queryBuilder(table, tree, queries, idx, knex, metricResolvers, dimensionResolvers, definedProviders, provider) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    if (queries === void 0) { queries = []; }
    if (idx === void 0) { idx = undefined; }
    if (!!~idx && idx !== undefined && !queries[idx])
        queries[idx] = {
            idx: idx,
            name: undefined,
            metricResolvers: metricResolvers,
            dimensionResolvers: dimensionResolvers,
            providers: definedProviders,
            provider: provider || 'pg'
        };
    var query = queries[idx];
    if (Array.isArray(tree)) {
        //we replace query with next level
        return tree.reduce(function (queries, t, i) {
            return queryBuilder(table, t, queries, queries.length - 1, knex, metricResolvers, dimensionResolvers, definedProviders, provider);
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
        return tree.selectionSet.selections.reduce(function (queries, t, i) {
            return queryBuilder(table, t, queries, queries.length, knex, metricResolvers, dimensionResolvers, definedProviders, provider);
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
        query.filters = parser_1.parseFilters(tree, query, knex);
        query.promise = filters_1.withFilters(query.filters)(query.promise);
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
            parser_1.parseDimension(tree, query, knex);
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
                queries[newIdx] = __assign(__assign({}, lodash_1.cloneDeep(lodash_1.omit(queries[idx], ['promise']))), { promise: query.promise.clone(), idx: newIdx });
                return queryBuilder(table, t, queries, newIdx, knex, metricResolvers, dimensionResolvers, definedProviders, provider);
            }
            return queryBuilder(table, t, queries, idx, knex, metricResolvers, dimensionResolvers, definedProviders, provider);
        }, queries);
    }
    parser_1.parseMetric(tree, query, knex);
    return queries;
}
var merge = function (tree, data, metricResolversData) {
    var queries = getMergeStrings(tree, undefined, undefined, metricResolversData);
    var batches = queries
        .filter(function (q) { return !q.skipBatching; })
        .reduce(function (r, q, i) {
        var key = q.name || '___query';
        if (!r[key])
            r[key] = [];
        q.bid = i;
        r[key].push(q);
        return r;
    }, {});
    function getMergedObject(batches, quer, fullObject, originFullObject) {
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
                        result = progressive_1.progressiveSet(result, replacedPath_1, value_1, false, q.hashContext);
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
    return Object.keys(batches)
        .filter(function (k) { return batches[k].some(function (q) { var _a; return ((_a = q.directives) === null || _a === void 0 ? void 0 : _a.length) > 0; }); })
        .reduce(function (r, k) {
        r[k.replace('___query', '')] = getMergedObject(batches, batches[k], r, res);
        return r;
    }, lodash_1.cloneDeep(res));
};
exports.merge = merge;
function getMergeStrings(tree, queries, idx, metricResolversData, hashContext) {
    var _a, _b, _c, _d;
    if (queries === void 0) { queries = []; }
    if (idx === void 0) { idx = undefined; }
    if (hashContext === void 0) { hashContext = {}; }
    if (!!~idx && idx !== undefined && !queries[idx])
        queries[idx] = { idx: idx, name: undefined };
    var query = queries[idx];
    if (query) {
        query.hashContext = hashContext;
    }
    if (Array.isArray(tree)) {
        return tree.reduce(function (queries, t, i) {
            return getMergeStrings(t, queries, queries.length - 1, metricResolversData);
        }, queries);
    }
    if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
        return tree.selectionSet.selections.reduce(function (queries, t, i) {
            queries.push({ idx: queries.length, name: undefined });
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
    if (query.name === undefined) {
        throw 'Cant find fetch in the payload';
    }
    if (!!((_c = tree.selectionSet) === null || _c === void 0 ? void 0 : _c.selections)) {
        var selections = tree.selectionSet.selections;
        var _e = selections.reduce(function (r, s) {
            return [r[0] || !!s.selectionSet, r[1] || !s.selectionSet];
        }, [false, false]), haveMetric_2 = _e[0], haveDimension_2 = _e[1];
        if (((_d = tree.name) === null || _d === void 0 ? void 0 : _d.value) !== 'fetch' && tree.name.value !== 'fetchPlain')
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
            return getMergeStrings(t, queries, idx, metricResolversData, hashContext);
        }, queries);
    }
    mergeMetric(tree, query);
    return queries;
}
function mergeMetric(tree, query) {
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
        if (metricResolversData[(_c = tree.name) === null || _c === void 0 ? void 0 : _c.value])
            return metricResolversData[(_d = tree.name) === null || _d === void 0 ? void 0 : _d.value](tree, query);
        query.metrics["" + (isInGetters ? fieldName : name)] = "" + query.path + (!!query.path ? '.' : '') + name;
        return directives_1.parseDirective(tree, query, 'metric', query.metrics["" + name]);
    }
}
function mergeDimension(tree, query) {
    var _a, _b, _c;
    var args = arguments_1.argumentsToObject(tree.arguments);
    query.getters = query.getters || [];
    if (tree.name.value === 'groupByEach') {
        query.getters.push("groupByEach_max_" + tree.alias.value);
        query.getters.push("groupByEach_min_" + tree.alias.value);
    }
    var name = ((_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value) || tree.name.value;
    if ((args === null || args === void 0 ? void 0 : args.type) === 'Array') {
        var names_1 = [];
        var pathPrefix = '';
        if (tree.name.value === 'combine') {
            if ((_b = tree.alias) === null || _b === void 0 ? void 0 : _b.value) {
                pathPrefix = tree.alias.value + ".";
            }
            args.fields.forEach(function (field) {
                if (field === 'string') {
                    names_1.push(field);
                }
                else {
                    names_1.push(field.alias || field.name);
                }
            });
        }
        else {
            names_1.push(name);
        }
        query.path += "" + (!!query.path ? '.' : '') + pathPrefix + "[@" + names_1
            .map(function (name) { return name + "=:" + name; })
            .join(';') + "]";
        return directives_1.parseDirective(tree, query, 'dimension');
    }
    else {
        var names_2 = [];
        var pathPrefix = '';
        if (tree.name.value === 'combine') {
            if ((_c = tree.alias) === null || _c === void 0 ? void 0 : _c.value) {
                pathPrefix = tree.alias.value + ".";
            }
            args.fields.forEach(function (field) {
                if (field === 'string') {
                    names_2.push(field);
                }
                else {
                    names_2.push(field.alias || field.name);
                }
            });
        }
        else {
            names_2.push(name);
        }
        query.path += "" + (!!query.path ? '.' : '') + pathPrefix + names_2
            .map(function (name) { return ":" + name; })
            .join(';');
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
    subtract: function (tree, query) {
        var _a;
        var name = "" + ((_a = tree.name) === null || _a === void 0 ? void 0 : _a.value);
        if (!query.subtract)
            query.subtract = {};
        if (query.path.startsWith(':subtract') ||
            query.path.startsWith(':subtract.'))
            query.path = query.path.replace(/:subtract\.?/, '');
        query.subtract["" + query.path + (!!query.path ? '.' : '') + name] = function (_a) {
            var value = _a.value, replacedPath = _a.replacedPath, fullObject = _a.fullObject;
            return value - progressive_1.progressiveGet(fullObject[query.filters.by], replacedPath);
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
    }
};
