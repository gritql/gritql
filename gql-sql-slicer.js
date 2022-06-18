"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.merge = exports.gqlToDb = void 0;
const knex_1 = __importDefault(require("knex"));
const arguments_1 = require("./arguments");
const directives_1 = require("./directives");
const gql_ga_slicer_1 = require("./gql-ga-slicer");
const progressive_1 = require("./progressive");
const lodash_1 = require("lodash");
const filters_1 = require("./filters");
const metrics_1 = require("./metrics");
const parser_1 = require("./parser");
const dimensions_1 = require("./dimensions");
const providers_1 = require("./providers");
const graphql_tag_1 = __importStar(require("graphql-tag"));
const types_1 = require("./types");
const deepmerge_1 = __importDefault(require("deepmerge"));
const parser_2 = require("./parser");
(0, graphql_tag_1.enableExperimentalFragmentVariables)();
(0, graphql_tag_1.disableFragmentWarnings)();
const gqlToDb = () => {
    let beforeDbHandler = (r) => Promise.resolve(r);
    let dbHandler = ({ queries }) => {
        return Promise.all(queries.map((q) => {
            return q.providers[q.provider].execute(q.providers[q.provider].connection, q.promise.toSQL());
        }));
    };
    let afterDbHandler = (r) => Promise.resolve(r);
    let customMetricResolvers = {};
    let customMetricDataResolvers = {};
    let customDimensionResolvers = {};
    let definedProviders = { ...providers_1.providers };
    const gqlFetch = async (gqlQuery, variables, provider) => {
        const knex = definedProviders[provider || 'pg'].client
            ? (0, knex_1.default)({
                client: definedProviders[provider || 'pg'].client,
            })
            : (0, knex_1.default)({});
        try {
            const definitions = (0, graphql_tag_1.default)(gqlQuery).definitions;
            const queries = queryBuilder(null, definitions, undefined, undefined, knex, {
                metricResolvers: { ...metrics_1.metricResolvers, ...customMetricResolvers },
                dimensionResolvers: {
                    ...dimensions_1.dimensionResolvers,
                    ...customDimensionResolvers,
                },
                providers: definedProviders,
                provider: provider || 'pg',
            }, {
                types: { ...parser_2.defaultTypes },
                fragments: {},
                variablesValidator: {},
                variables,
            })
                .filter((q) => !q.skip)
                .filter((q) => !!q.promise)
                .map((q) => {
                q.promise = (0, filters_1.applyFilters)(q, q.promise, knex);
                return q;
            });
            const sql = queries
                .filter((q) => !q.isWith)
                .map((q) => q.promise.toString());
            const preparedGqlQuery = await beforeDbHandler({
                queries: queries.filter((q) => !q.isWith),
                sql,
                definitions,
            });
            if (!preparedGqlQuery)
                return null;
            const resultFromDb = await dbHandler(preparedGqlQuery);
            if (!resultFromDb)
                return null;
            afterDbHandler(definitions, resultFromDb);
            return await (0, exports.merge)(definitions, resultFromDb, {
                ...metricResolversData,
                ...customMetricDataResolvers,
            });
        }
        catch (e) {
            console.log(e);
            throw Error(e);
        }
    };
    gqlFetch.beforeDbFetch = (fn) => {
        beforeDbHandler = fn;
        return gqlFetch;
    };
    gqlFetch.dbFetch = (fn) => {
        dbHandler = fn;
        return gqlFetch;
    };
    gqlFetch.afterDbFetch = (fn) => {
        afterDbHandler = fn;
        return gqlFetch;
    };
    gqlFetch.useResolver = (name, fn) => {
        customMetricResolvers = { ...customMetricResolvers, [name]: fn };
    };
    gqlFetch.useDimensionResolver = (name, fn) => {
        customDimensionResolvers = { ...customDimensionResolvers, [name]: fn };
    };
    gqlFetch.useProvider = (name, provider) => {
        definedProviders = (0, deepmerge_1.default)(definedProviders, { [name]: provider });
    };
    gqlFetch.useDataResolver = (name, fn) => {
        customMetricDataResolvers = { ...customMetricDataResolvers, [name]: fn };
    };
    gqlFetch.setupProvider = (name, configuration) => {
        definedProviders[name] = {
            ...definedProviders[name],
            configuration,
            connection: definedProviders[name].getConnection(configuration, definedProviders[name].getConnector()),
        };
    };
    return gqlFetch;
};
exports.gqlToDb = gqlToDb;
function queryBuilder(table, tree, queries = [], idx = undefined, knex, options, context = {
    fragments: {},
    types: {},
    variablesValidator: {},
    variables: {},
}) {
    if (!!~idx && idx !== undefined && !queries[idx])
        queries[idx] = {
            idx,
            name: undefined,
            metricResolvers: options.metricResolvers,
            dimensionResolvers: options.dimensionResolvers,
            providers: options.providers,
            provider: options.provider || 'pg',
            context,
        };
    const query = queries[idx];
    if (Array.isArray(tree)) {
        //we replace query with next level
        return tree.reduce((queries, t, i) => queryBuilder(table, t, queries, queries.length ? queries.length - 1 : 0, knex, options, context), queries);
    }
    switch (tree.kind) {
        case 'EnumTypeDefinition':
        case 'UnionTypeDefinition':
        case 'InputObjectTypeDefinition':
        case 'ObjectTypeDefinition':
            (0, parser_1.parseType)(tree, context);
            return queries.filter((query) => query.idx === idx);
        case 'FragmentDefinition':
            context.fragments[tree.name.value] = {
                name: tree.name,
                selections: tree.selectionSet.selections,
                variableDefinitions: tree.variableDefinitions || [],
            };
            return queries.filter((query) => query.idx !== idx);
        case 'OperationDefinition':
            if (!!tree.selectionSet) {
                const ctx = {
                    ...context,
                    variablesValidator: (0, lodash_1.cloneDeep)(context.variablesValidator),
                    variables: (0, lodash_1.cloneDeep)(context.variables),
                };
                if (tree.operation === 'query' && !!tree.name?.value) {
                    if (tree?.variableDefinitions[0]?.variable?.name?.value === 'source' &&
                        tree?.variableDefinitions[0]?.type?.name?.value === 'GA') {
                        return (0, gql_ga_slicer_1.gaQueryBuilder)(table, tree, queries, idx, knex, gql_ga_slicer_1.gaMetricResolvers);
                    }
                    else {
                        tree.variableDefinitions.forEach((def) => {
                            (0, parser_1.parseVariableDefinition)(def, ctx);
                        });
                        (0, types_1.checkPropTypes)(ctx.variablesValidator, ctx.variables, 'query', tree.name.value);
                    }
                    table = tree.name?.value;
                }
                return tree.selectionSet.selections
                    .reduce((selections, field) => {
                    return (0, parser_1.processSelections)(selections, field, { context: ctx }, ctx);
                }, [])
                    .reduce((queries, t, i) => queryBuilder(table, t, queries, queries.length, knex, options, ctx), queries);
            }
    }
    if (!query.filters &&
        (tree.name.value === 'fetch' ||
            tree.name.value === 'fetchPlain' ||
            tree.name.value === 'with')) {
        query.name = tree.alias?.value || null;
        query.table = table;
        query.promise = knex.select().from(table);
        query.joins = [];
        query.filters = (0, parser_1.parseFilters)(tree, query, knex);
        query.promise = (0, filters_1.withFilters)(query.filters)(query.promise, knex);
        if (tree.name.value === 'with') {
            query.isWith = true;
        }
        if (query.table === undefined) {
            throw 'Table name must be specified trought table argument or query name';
        }
        if (!query.isWith) {
            queries
                .filter((q) => q !== query && q.isWith)
                .forEach((q) => {
                query.promise = query.promise.with(q.name, q.promise);
            });
        }
        if (!tree.selectionSet?.selections)
            throw 'The query is empty, you need specify metrics or dimensions';
    }
    //console.log(JSON.stringify(tree, null, 2))
    if (query.name === undefined) {
        throw 'Builder: Cant find fetch in the payload';
    }
    if (!!tree.selectionSet?.selections) {
        const selections = tree.selectionSet.selections;
        const [haveMetric, haveDimension] = selections.reduce((r, s) => {
            //check multiple dimensions we also need to split queries in the case
            if (r[1] && !!s.selectionSet)
                return [true, true];
            return [r[0] || !s.selectionSet, r[1] || !!s.selectionSet];
        }, [false, false]);
        if (tree.name?.value !== 'fetch' &&
            tree.name?.value !== 'fetchPlain' &&
            tree.name?.value !== 'with' &&
            !tree.with)
            (0, parser_1.parseDimension)(tree, query, knex);
        selections.sort((a, b) => {
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
        return selections.reduce((queries, t, i) => {
            if (!!t.selectionSet && haveMetric && haveDimension) {
                const newIdx = queries.length;
                queries[newIdx] = {
                    ...(0, lodash_1.cloneDeep)((0, lodash_1.omit)(queries[idx], ['promise'])),
                    promise: query.promise.clone(),
                    idx: newIdx,
                };
                return queryBuilder(table, t, queries, newIdx, knex, options, context);
            }
            return queryBuilder(table, t, queries, idx, knex, options, context);
        }, queries);
    }
    (0, parser_1.parseMetric)(tree, query, knex);
    return queries;
}
const merge = (tree, data, metricResolversData) => {
    const queries = getMergeStrings(tree, undefined, undefined, metricResolversData);
    const batches = queries
        .filter((q) => !q.skipBatching)
        .reduce((r, q, i) => {
        const key = q.name || '___query';
        if (!r[key])
            r[key] = [];
        q.bid = i;
        r[key].push(q);
        return r;
    }, {});
    function getMergedObject(batches, quer, fullObject, originFullObject) {
        if (!!quer[0].skipMerge) {
            return quer.reduce((result, q) => {
                result.push(data[q.bid]);
                return result;
            }, []);
        }
        if (!originFullObject) {
            originFullObject = fullObject;
        }
        return quer.reduce((result, q) => {
            const resultData = data[q.bid];
            for (var j = 0; j < resultData.length; j++) {
                const keys = Object.keys(resultData[j]);
                for (var key in keys) {
                    if (q.metrics[keys[key]]) {
                        let replacedPath = (0, progressive_1.replVars)(q.metrics[keys[key]], resultData[j]);
                        let value = resultData[j][keys[key]];
                        let skip = false;
                        let skipAll = false;
                        q.directives
                            .filter((directiveFunction) => {
                            if (directiveFunction.context.on === 'metric') {
                                return directiveFunction.context.path === q.metrics[keys[key]];
                            }
                            else {
                                return q.metrics[keys[key]].startsWith(directiveFunction.context.path);
                            }
                        })
                            .forEach((directiveFunction) => {
                            const path = q.metrics[keys[key]];
                            const [globalReplacedPath, globalPath, pathKey] = [
                                replacedPath.slice(0, replacedPath.lastIndexOf('.')),
                                path.slice(0, path.lastIndexOf('.')),
                                replacedPath.slice(replacedPath.lastIndexOf('.') + 1),
                            ];
                            const directiveResult = directiveFunction({
                                value,
                                originValue: resultData[j][keys[key]],
                                data: resultData[j],
                                path,
                                key: pathKey,
                                globalPath,
                                globalReplacedPath,
                                row: j,
                                replacedPath,
                                result,
                                fullObject,
                                originFullObject,
                                queries: quer,
                                batches,
                                q,
                            });
                            // Important for directives which will not change value
                            if (directiveResult.hasOwnProperty('value')) {
                                value = directiveResult.value;
                            }
                            if (directiveResult.skipAll) {
                                skipAll = directiveResult.skipAll;
                            }
                            if (directiveResult.skip) {
                                skip = directiveResult.skip;
                            }
                            if (directiveResult.path) {
                                replacedPath = directiveResult.path;
                            }
                            if (directiveResult.replacers) {
                                Object.keys(directiveResult.replacers).forEach((k) => {
                                    result = (0, progressive_1.progressiveSet)(result, replacedPath.slice(0, replacedPath.lastIndexOf('.')) +
                                        '.' +
                                        k, directiveResult.replacers[k], false, q.hashContext);
                                });
                            }
                        });
                        if (skipAll) {
                            j++;
                            break;
                        }
                        if (skip) {
                            continue;
                        }
                        result = (0, progressive_1.progressiveSet)(result, replacedPath, value, false, q.hashContext);
                    }
                }
            }
            return result;
        }, {});
    }
    if (Object.keys(batches).length === 1 && !!batches['___query']) {
        const merged = getMergedObject(batches, queries, null, null);
        if (Object.values(batches)[0].some((q) => q.directives?.length > 0)) {
            return getMergedObject(batches, queries, null, merged);
        }
        else {
            return merged;
        }
    }
    const res = Object.keys(batches).reduce((r, k) => {
        r[k.replace('___query', '')] = getMergedObject(batches, batches[k], null, null);
        return r;
    }, {});
    // When
    return Object.keys(batches)
        .filter((k) => batches[k].some((q) => q.directives?.length > 0))
        .reduce((r, k) => {
        r[k.replace('___query', '')] = getMergedObject(batches, batches[k], r, res);
        return r;
    }, (0, lodash_1.cloneDeep)(res));
};
exports.merge = merge;
function getMergeStrings(tree, queries = [], idx = undefined, metricResolversData, hashContext = {}) {
    if (!!~idx && idx !== undefined && !queries[idx])
        queries[idx] = { idx, name: undefined };
    const query = queries[idx];
    if (query) {
        query.hashContext = hashContext;
    }
    if (Array.isArray(tree)) {
        return tree.reduce((queries, t, i) => getMergeStrings(t, queries, queries.length - 1, metricResolversData), queries);
    }
    if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
        return tree.selectionSet.selections.reduce((queries, t, i) => {
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
        query.name = tree.alias?.value || null;
        query.metrics = {};
        query.path = '';
        if (tree.name.value === 'fetchPlain') {
            query.skipMerge = true;
        }
        if (!tree.selectionSet?.selections)
            throw 'The query is empty, you need specify metrics or dimensions';
    }
    if (query.name === undefined) {
        throw 'Cant find fetch in the payload';
    }
    if (!!tree.selectionSet?.selections) {
        const selections = tree.selectionSet.selections;
        const [haveMetric, haveDimension] = selections.reduce((r, s) => {
            return [r[0] || !!s.selectionSet, r[1] || !s.selectionSet];
        }, [false, false]);
        if (tree.name?.value !== 'fetch' && tree.name.value !== 'fetchPlain')
            mergeDimension(tree, query);
        selections.sort((a, b) => (!b.selectionSet ? -1 : 1));
        return selections.reduce((queries, t, i) => {
            if (!!t.selectionSet && haveMetric && haveDimension) {
                const newIdx = queries.length;
                queries[newIdx] = { ...queries[idx], metrics: {} };
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
    let name = tree.alias?.value || tree.name.value;
    const fieldName = tree.name.value;
    const isInGetters = query.getters?.find((name) => name === fieldName);
    const args = (0, arguments_1.argumentsToObject)(tree.arguments);
    if (args?.type === 'Array') {
        query.path += `${!!query.path ? '.' : ''}[@${name}=:${name}]`;
        query.metrics[`${isInGetters ? fieldName : name}`] = `${query.path}${!!query.path ? '.' : ''}${name}`;
        return (0, directives_1.parseDirective)(tree, query, 'metric', query.metrics[`${name}`]);
    }
    else {
        if (metricResolversData[tree.name?.value])
            return metricResolversData[tree.name?.value](tree, query);
        query.metrics[`${isInGetters ? fieldName : name}`] = `${query.path}${!!query.path ? '.' : ''}${name}`;
        return (0, directives_1.parseDirective)(tree, query, 'metric', query.metrics[`${name}`]);
    }
}
function mergeDimension(tree, query) {
    const args = (0, arguments_1.argumentsToObject)(tree.arguments);
    query.getters = query.getters || [];
    let name = tree.alias?.value || tree.name.value;
    if (args?.type === 'Array') {
        const names = [];
        let pathPrefix = '';
        if (tree.name.value === 'combine') {
            if (tree.alias?.value) {
                pathPrefix = `${tree.alias.value}.`;
            }
            args.fields.forEach((field) => {
                if (field === 'string') {
                    names.push(field);
                }
                else {
                    names.push(field.alias || field.name);
                }
            });
        }
        else {
            names.push(name);
        }
        query.path += `${!!query.path ? '.' : ''}${pathPrefix}[@${names
            .map((name) => `${name}=:${name}`)
            .join(';')}]`;
        return (0, directives_1.parseDirective)(tree, query, 'dimension');
    }
    else {
        const names = [];
        let pathPrefix = '';
        if (tree.name.value === 'combine') {
            if (tree.alias?.value) {
                pathPrefix = `${tree.alias.value}.`;
            }
            args.fields.forEach((field) => {
                if (field === 'string') {
                    names.push(field);
                }
                else {
                    names.push(field.alias || field.name);
                }
            });
        }
        else {
            names.push(name);
        }
        query.path += `${!!query.path ? '.' : ''}${pathPrefix}${names
            .map((name) => `:${name}`)
            .join(';')}`;
        return (0, directives_1.parseDirective)(tree, query, 'dimension');
    }
}
const metricResolversData = {
    aggrAverage: (tree, query) => {
        const name = `${tree.alias?.value}_aggrAverage`;
        query.metrics[`${name}`] = `${query.path}${!!query.path ? '.' : ''}${name}`;
    },
    weightAvg: (tree, query) => {
        const name = `${tree.alias?.value}`;
        query.metrics[`${name}`] = `${query.path}${!!query.path ? '.' : ''}${name}`;
    },
    join: (tree, query) => {
        const name = `${tree.alias?.value || tree.name.value}`;
        query.metrics[name] = query.metrics[name].replace(/:join\./g, '');
    },
    groupByEach: (tree, query) => {
        query.getters.push(`groupByEach_max_${tree.alias.value}`);
        query.getters.push(`groupByEach_min_${tree.alias.value}`);
    },
    subtract: (tree, query) => {
        const name = `${tree.name?.value}`;
        if (!query.subtract)
            query.subtract = {};
        if (query.path.startsWith(':subtract') ||
            query.path.startsWith(':subtract.'))
            query.path = query.path.replace(/:subtract\.?/, '');
        query.subtract[`${query.path}${!!query.path ? '.' : ''}${name}`] = ({ value, replacedPath, fullObject, }) => {
            return value - (0, progressive_1.progressiveGet)(fullObject[query.filters.by], replacedPath);
        };
    },
    divideBy: (tree, query) => {
        const name = `${tree.name?.value}`;
        if (!query.divideBy)
            query.divideBy = {};
        if (query.path.startsWith(':divideBy') ||
            query.path.startsWith(':divideBy.'))
            query.path = query.path.replace(/:divideBy\.?/, '');
        query.divideBy[`${query.path}${!!query.path ? '.' : ''}${name}`] = ({ value, replacedPath, fullObject, }) => {
            return value / (0, progressive_1.progressiveGet)(fullObject[query.filters.by], replacedPath);
        };
    },
};
