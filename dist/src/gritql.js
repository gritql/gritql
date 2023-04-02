"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Merger_1 = require("./entities/Merger");
const QueryProcessor_1 = require("./entities/QueryProcessor");
const QueryTransformer_1 = require("./entities/QueryTransformer");
const ResultProcessor_1 = require("./entities/ResultProcessor");
const ResultTransformer_1 = require("./entities/ResultTransformer");
const PostgresProvider_1 = require("./providers/PostgresProvider");
const tiny_emitter_1 = require("tiny-emitter");
const lodash_1 = require("lodash");
const directives_1 = require("../directives");
const filters_1 = require("../filters");
const types_1 = require("../types");
const parser_1 = require("../parser");
const graphql_tag_1 = __importDefault(require("graphql-tag"));
class Runner {
}
class GritQL {
    constructor() {
        this.sourceProviders = [];
        this.emitter = new tiny_emitter_1.TinyEmitter();
    }
    queryParser(tree, queries = [], idx = 0, context = {
        fragments: {},
        types: {},
        variablesValidator: {},
        variables: {},
        typeDefinitions: {},
    }) {
        if (idx !== undefined && !!~idx && !queries[idx])
            queries[idx] = {
                idx,
                name: undefined,
                context,
            };
        const query = queries[idx];
        switch (tree.kind) {
            case 'EnumTypeDefinition':
            case 'UnionTypeDefinition':
            case 'InputObjectTypeDefinition':
            case 'ObjectTypeDefinition':
            case 'TupleTypeDefinition':
                context.typeDefinitions[tree.name.value] = tree;
                tree = (0, directives_1.parseTypeDirective)(tree, context);
                if (Array.isArray(tree)) {
                    tree.forEach((tree) => {
                        context.typeDefinitions[tree.name.value] = tree;
                    });
                }
                else {
                    context.typeDefinitions[tree.name.value] = tree;
                }
        }
        if (Array.isArray(tree)) {
            //we replace query with next level
            return tree.reduce((queries, t, i) => this.queryParser(t, queries, queries.length ? queries.length - 1 : 0, context), queries);
        }
        switch (tree.kind) {
            case 'EnumTypeDefinition':
            case 'UnionTypeDefinition':
            case 'InputObjectTypeDefinition':
            case 'ObjectTypeDefinition':
            case 'TupleTypeDefinition':
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
                        tree.variableDefinitions.forEach((def) => {
                            (0, parser_1.parseVariableDefinition)(def, ctx);
                        });
                        (0, types_1.checkPropTypes)(ctx.variablesValidator, ctx.variables, 'query', tree.name.value);
                        query.table = tree.name?.value;
                        query.provider = 0;
                        //TODO:get provider here
                        //specify builder
                    }
                    return tree.selectionSet.selections
                        .reduce((selections, field) => {
                        return (0, parser_1.processSelections)(selections, field, { context: ctx }, ctx);
                    }, [])
                        .filter(Boolean)
                        .reduce((queries, t, i) => this.queryParser(t, queries, queries.length, ctx), queries);
                }
        }
        console.log(query.provider, this.sourceProviders[0]);
        const builder = this.sourceProviders[query.provider].getQueryBuilder();
        if (!query.filters &&
            (tree.name.value === 'fetch' ||
                tree.name.value === 'fetchPlain' ||
                tree.name.value === 'with')) {
            query.name = tree.alias?.value || null;
            query.promise = this.sourceProviders[query.provider].getQueryPromise(query, builder);
            query.joins = [];
            query.orderBys = [];
            query.filters = (0, parser_1.parseFilters)(tree, query, builder);
            query.promise = (0, filters_1.withFilters)(query, query.filters)(query.promise, builder);
            if (tree.name.value === 'with') {
                this.sourceProviders[query.provider].disableOperationFor(query, 'with');
                query.isWith = true;
            }
            // For GA provider we don't need table name
            if (query.table === undefined && query.provider !== 'ga') {
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
                (0, parser_1.parseDimension)(tree, query, builder);
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
                    return this.queryParser(t, queries, newIdx, context);
                }
                return this.queryParser(t, queries, idx, context);
            }, queries);
        }
        (0, parser_1.parseMetric)(tree, query, builder);
        return queries;
    }
    //put query parser inside gritql
    //it should have access to all providers
    //providers should have klear ids, that can be used in query definition as argument/directive??
    getRequestBuilder(providerId) {
        //TODO: implement finding provider by id
        //and returning request buildter
        return {};
    }
    fetch(gqlQuery, variables, providerId) {
        this.emitter.emit('parseStart');
        const builder = this.getRequestBuilder(providerId);
        try {
            const definitions = (0, lodash_1.cloneDeep)((0, graphql_tag_1.default)(gqlQuery).definitions);
            this.queryParser(definitions);
        }
        catch (e) {
            console.log(e);
            console.log(e.stack);
            throw Error(e);
        }
    }
    use(provider) {
        if (provider instanceof QueryTransformer_1.QueryTransformer) {
            //this.queryTransformer = provider
        }
        else if (provider instanceof ResultTransformer_1.ResultTransformer) {
            //this.resultTransformer = provider
        }
        else {
            //TODO: check if sourceProviders already have signature, replace in the case
            //destroy should force disconnect
            this.sourceProviders.push(provider);
        }
    }
}
const postgresqlProvider = new PostgresProvider_1.PostgresProvider({});
const merger = new Merger_1.Merger();
const someProcessor = new QueryProcessor_1.QueryProcessor();
const someResProcessor = new ResultProcessor_1.ResultProcessor();
const qritQLEngine = () => {
    const gritql = new GritQL();
    gritql.use(postgresqlProvider);
    /*const { queryTransformer, resultTransformer } = gritql
  
    queryTransformer.use(someProcessor)
  
    resultTransformer.use(someResProcessor)
    resultTransformer.use(merger)*/
    return gritql;
};
const qlEngine = qritQLEngine();
console.log(qlEngine.queryParser((0, graphql_tag_1.default)(`query test {
  data: sum(a: t)
}`).definitions));
/*
preModificator
preModificator
preModificator
getQueryBuilder
<metricResolvers
<dimensionResolver
postModificator
postModificator
postModificator
dbHandler

merger*/
