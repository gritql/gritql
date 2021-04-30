const gql = require('graphql-tag');
const knexConstructor = require('knex');


type TagObject = {
  kind: 'OperationDefinition'
  operation: 'query'
  name: any
  variableDefenitions: any
  derictives: any
  selectionSet: any
}
type GqlQuery = {
  promise: Promise<any>
  name: string
  filters: Array<string>
}

type gqlBuildObject = {
  queries: Array<GqlQuery>
  sql: Array<string>
  definitions: Array<TagObject>
}
interface BeforeDbHandler {
  (QueryObject: gqlBuildObject): Promise<gqlBuildObject>
}
interface DbHandler {
  (QueryObject: gqlBuildObject): Promise<any>
}

export const gqlToDb = (opts: any = { client: 'pg' }) => {
  const knex = knexConstructor(opts);
  let beforeDbHandler: BeforeDbHandler = (r) => Promise.resolve(r);
  let dbHandler: DbHandler = ({ queries }) => Promise.all(queries.map(q => q.promise))

  const gqlFetch = async (gqlQuery: string): Promise<any> => {

    try {
      const definitions = gql(gqlQuery).definitions;

      const queries = queryBuilder(null, definitions, undefined, undefined, knex).filter(q => !q.skip);
      const sql = queries.map(q => q.promise.toString())
      const preparedGqlQuery = await beforeDbHandler({ queries, sql, definitions });
      if (!preparedGqlQuery) return null;
      const resultFromDb = await dbHandler(preparedGqlQuery);
      if (!resultFromDb) return null;
      return await merge(definitions, resultFromDb)
    } catch (e) {
      throw Error(e)
      return null;
    }

  }
  gqlFetch.beforeDbFetch = (fn: BeforeDbHandler) => {
    beforeDbHandler = fn;
    return gqlFetch;
  }
  gqlFetch.dbFetch = (fn: DbHandler) => {
    dbHandler = fn;
    return gqlFetch;
  }

  return gqlFetch;
}


function queryBuilder(table, tree, queries: Array<any> | undefined = [], idx: number | undefined = undefined, knex) {
  //console.log(queries.map(q => q.promise._statements))
  //console.log(tree, idx, queries)
  //console.log(queries, idx, tree.length)
  if (!!~idx && idx !== undefined && !queries[idx]) queries[idx] = { idx, name: undefined };
  const query = queries[idx];
  if (Array.isArray(tree)) {
    //we replace query with next level
    return tree.reduce((queries, t, i) => queryBuilder(table, t, queries, queries.length - 1, knex), queries);
  }
  if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
    if (tree.operation === 'query' && !!tree.name?.value) table = tree.name?.value
    return tree.selectionSet.selections.reduce((queries, t, i) => queryBuilder(table, t, queries, queries.length, knex), queries);
  }
  if (!query.filters && tree.name.value === 'fetch') {

    query.name = tree.alias?.value || null;
    query.table = table;
    query.filters = parseFilters(tree);
    query.promise = knex.select().from(table);
    //if(filters)
    query.promise = withFilters(query.filters)(query.promise)
    if (!tree.selectionSet?.selections) throw "The query is empty, you need specify metrics or dimensions";
  }
  //console.log(JSON.stringify(tree, null, 2))
  if (query.name === undefined) throw "Builder: Cant find fetch in the payload";

  if (!!tree.selectionSet?.selections) {
    const selections = tree.selectionSet.selections;
    const [haveMetric, haveDimension] = selections.reduce((r, s) => {
      //check multiple dimensions we also need to split queries in the case
      if (r[1] && !!s.selectionSet) return [true, true];
      return [r[0] || !s.selectionSet, r[1] || !!s.selectionSet];
    }, [false, false])

    if (tree.name?.value !== 'fetch' && !tree.with) parseDimension(tree, query, knex);
    selections.sort((a, b) => !b.selectionSet ? -1 : 1);


    return selections.reduce((queries, t, i) => {
      if (!!t.selectionSet && haveMetric && haveDimension) {
        const newIdx = queries.length;
        queries[newIdx] = { ...queries[idx] };
        if (!!query.metrics) queries[newIdx].metrics = JSON.parse(JSON.stringify(query.metrics));
        if (!!query.dimensions) queries[newIdx].dimensions = JSON.parse(JSON.stringify(query.dimensions));
        queries[newIdx].promise = copyKnex(query.promise, knex);
        queries[newIdx].idx = newIdx;
        return queryBuilder(table, t, queries, newIdx, knex);
      }
      return queryBuilder(table, t, queries, idx, knex)
    }, queries);
  }
  parseMetric(tree, query, knex);
  return queries
}
function parseMetric(tree, query, knex) {
  const { metrics = [] } = query;
  if (tree.alias && metricResolvers[tree.name?.value]) return metricResolvers[tree.name?.value](tree, query, knex)
  if (!tree.alias?.value) {
    query.promise = query.promise.select(`${tree.name.value}`)
  } else {
    query.promise = query.promise.select(`${tree.name.value} as ${tree.alias.value}`)
  }

  metrics.push(tree.name.value);
  query.metrics = metrics;
}

function parseDimension(tree, query, knex) {
  const { dimensions = [] } = query;

  const args = argumentsToObject(tree.arguments);

  if (args?.groupBy) {
    query.promise = query.promise.select(knex.raw(`date_trunc(?, ??) as ??`, [args?.groupBy, tree.name.value, tree.name.value]));
    query.promise = query.promise.groupBy(1);
  } else {
    query.promise = query.promise.select(tree.name.value);
    query.promise = query.promise.groupBy(tree.name.value);
  }
  if (!!args?.sort_desc) query.promise.orderBy(args?.sort_desc, 'desc');
  if (!!args?.sort_asc) query.promise.orderBy(args?.sort_asc, 'asc');

  if (!!args?.limit) query.promise.limit(args?.limit);
  if (!!args?.offset) query.promise.offset(args?.offset);
  if (!!args?.cutoff) {
    query.promise.select(knex.raw(`sum(??)/sum(sum(??)) over () as cutoff`, [args?.cutoff, args?.cutoff]));
  }

  dimensions.push(tree.name.value);
  query.dimensions = dimensions;
}

function parseFilters(tree) {
  const { arguments: args } = tree;
  return args.reduce((res, arg) => {
    if (arg.name.value.endsWith('_gt')) return res.concat([[arg.name.value.replace('_gt', ''), '>', arg.value.value]]);
    if (arg.name.value.endsWith('_gte')) return res.concat([[arg.name.value.replace('_gte', ''), '>=', arg.value.value]]);
    if (arg.name.value.endsWith('_lt')) return res.concat([[arg.name.value.replace('_lt', ''), '<', arg.value.value]]);
    if (arg.name.value.endsWith('_lte')) return res.concat([[arg.name.value.replace('_lte', ''), '<=', arg.value.value]]);
    return res.concat([[arg.name.value, '=', arg.value.value]]);
  }, []);
}
const metricResolvers = {
  sum: (tree, query, knex) => {
    if (!tree.arguments) throw "Sum function requires arguments";
    const args = argumentsToObject(tree.arguments);
    if (!args.a) throw "Sum function requires 'a' as argument";
    query.promise = query.promise.sum(`${args.a} as ${tree.alias.value}`);
  },
  share: (tree, query, knex) => {
    if (!tree.arguments) throw "Share function requires arguments";
    const args = argumentsToObject(tree.arguments);
    if (!args.a) throw "Share  function requires 'a' as argument";
    let partition = '';
    if (!!args.by) partition = knex.raw(`partition by ??`, [args.by]);
    query.promise = query.promise.select(knex.raw(`sum(??)/sum(sum(??)) over (${partition}) as ??`, [args.a, args.a, tree.alias.value]));
  },
  divide: (tree, query, knex) => {
    if (!tree.arguments) throw "Divide function requires arguments";
    const args = argumentsToObject(tree.arguments);
    const functions = Object.keys(args).reduce((r, k) => {
      const fns = args[k].split('|');
      if (fns.length === 2) {
        args[k] = fns[1];
        r[k] = fns[0];
      }
      return r;
    }, { a: 'sum', by: 'sum' });

    if (!args.a) throw "Divide function requires 'a' as argument";
    if (!args.by) throw "Divide function requires 'by' as argument";

    query.promise = query.promise.select(knex.raw(`cast(??(??) as float)/NULLIF(cast(??(??) as float), 0) as ??`, [functions.a, args.a, functions.by, args.by, tree.alias.value]));
  },
  aggrAverage: (tree, query, knex) => {
    if (!tree.arguments) throw "AggrAverage function requires arguments";
    const args = argumentsToObject(tree.arguments);
    if (!args.to) throw "aggrAverage function requires 'to' as argument";
    if (!args.by) throw "aggrAverage function requires 'by' as argument";
    let internal = query.promise.select(tree.alias.value)
      .sum(`${args.to} as ${args.to}`)
      .sum(`${args.by} as ${args.by}`)
      .select(knex.raw(`?? * sum(??) as "aggrAverage"`, [tree.alias?.value, args.to]))
      .groupBy(tree.alias?.value)
    if (args.to !== args.by) internal = internal.sum(`${args.by} as ${args.by}`);
    query.promise = knex.select(query.dimensions)
      .select(knex.raw(`sum("aggrAverage")/max(??) as "${tree.alias?.value}_aggrAverage"`, [args.by]))
      .from(internal.as('middleTable'))

    if (!!query.dimensions && query.dimensions.length > 0) {
      query.promise = query.promise.groupBy(query.dimensions);
    }
  },
  weightAvg: (tree, query, knex) => {
    if (!tree.arguments) throw "weightAvg function requires arguments";
    const args = argumentsToObject(tree.arguments);
    if (!args.a) throw "weightAvg function requires 'a' as argument";
    if (!args.by) throw "weightAvg function requires 'by' as argument";
    let internal = query.promise.select(args.a)
      .sum(`${args.by} as ${args.by}`)
      .select(knex.raw(`?? * sum(??) as "weightAvg"`, [args.a, args.by]))
      .groupBy(args.a);

    query.promise = knex.select(query.dimensions)
      .select(knex.raw(`sum("weightAvg")/sum(??) as "${tree.alias?.value}"`, [args.by]))
      .from(internal.as('middleTable'))

    if (!!query.dimensions && query.dimensions.length > 0) {
      query.promise = query.promise.groupBy(query.dimensions);
    }
  },
  distinct: (tree, query, knex) => {

    query.promise = query.promise.distinct(tree.alias.value);
  }
}

function copyKnex(knexObject, knex) {
  const result = knex(knexObject._single.table);

  return Object.keys(knexObject).reduce((k, key) => {
    if (key.startsWith("_") && !!knexObject[key]) {

      k[key] = JSON.parse(JSON.stringify(knexObject[key]))
    }
    return k;
  }, result)
}
export const merge = (tree: Array<TagObject>, data: Array<any>): any => {
  const queries = getMergeStrings(tree);

  const batches = queries.reduce((r, q, i) => {
    const key = q.name || "___query";
    if (!r[key]) r[key] = [];
    q.bid = i;
    r[key].push(q);
    return r;
  }, {})

  function getMergedObject(quer) {
    return quer.reduce((result, q, i) => {
      const resultData = data[q.bid];
      let skipArray = [];
      for (var j = 0; j < resultData.length; j++) {
        const keys = Object.keys(resultData[j]);

        for (var key in keys) {
          if (keys[key] === 'cutoff' && +resultData[j][keys[key]] < 0.005) {
            skipArray.push(replVars(q.cutoff, resultData[j]))
          }
          if (q.metrics[keys[key]]) {
            const replacedPath = replVars(q.metrics[keys[key]], resultData[j]);
            const valueDir = replacedPath.slice(0, -(keys[key].length + 1));
            if (skipArray.includes(valueDir)) continue;
            const value = isNaN(+resultData[j][keys[key]]) ? resultData[j][keys[key]] : +resultData[j][keys[key]];
            result = progressiveSet(result, replacedPath, value)
          }
        }
      }
      return result;

    }, {})
  }

  if (Object.keys(batches).length === 1 && !!batches["___query"]) {
    return getMergedObject(queries);
  }
  const res = Object.keys(batches).reduce((r, k) => {
    r[k.replace('___query', '')] = getMergedObject(batches[k])
    return r;
  }, {})

  return res;
}


function replVars(str, obj) {
  const keys = Object.keys(obj);
  for (var key in keys) {
    str = str.replace(`:${keys[key]}`, shieldSeparator(obj[keys[key]]));
  }
  return str;
}

function shieldSeparator(str) {
  if (typeof (str) !== 'string') return str;
  return str.replace(/\./g, "$#@#");
}
function unshieldSeparator(str) {
  if (typeof (str) !== 'string') return str;
  return str.replace(/\$#@#/, '.');
}


function getMergeStrings(tree, queries = [], idx = undefined) {

  if (!!~idx && idx !== undefined && !queries[idx]) queries[idx] = { idx, name: undefined };
  const query = queries[idx];
  if (Array.isArray(tree)) {

    return tree.reduce((queries, t, i) => getMergeStrings(t, queries, queries.length - 1), queries);
  }
  if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
    return tree.selectionSet.selections.reduce((queries, t, i) => getMergeStrings(t, queries, queries.length), queries);
  }

  if (!query.filters && tree.name.value === 'fetch') {
    query.name = tree.alias?.value || null;
    query.metrics = {};
    query.path = '';

    if (!tree.selectionSet?.selections) throw "The query is empty, you need specify metrics or dimensions";
  }
  if (query.name === undefined) throw "Cant find fetch in the payload";

  if (!!tree.selectionSet?.selections) {
    const selections = tree.selectionSet.selections;
    const [haveMetric, haveDimension] = selections.reduce((r, s) => {
      return [r[0] || !!s.selectionSet, r[1] || !s.selectionSet];
    }, [false, false])
    if (tree.name?.value !== 'fetch') mergeDimension(tree, query);
    selections.sort((a, b) => !b.selectionSet ? -1 : 1);
    return selections.reduce((queries, t, i) => {
      if (!!t.selectionSet && haveMetric && haveDimension) {
        const newIdx = queries.length;
        queries[newIdx] = { ...queries[idx], metrics: {} };
        queries[newIdx].path = query.path + '';
        queries[newIdx].idx = newIdx;
        return getMergeStrings(t, queries, newIdx);
      }

      return getMergeStrings(t, queries, idx)
    }, queries);
  }
  mergeMetric(tree, query);
  return queries
}

function mergeMetric(tree, query) {
  let name = tree.name.value;
  const args = argumentsToObject(tree.arguments);
  if (args?.type === 'Array') {
    if (tree.alias?.value) name = tree.alias?.value;
    query.path += `${!!query.path ? '.' : ''}[@${name}=:${name}]`
    query.metrics[`${name}`] = `${query.path}${!!query.path ? '.' : ''}${name}`;

  } else {
    if (tree.alias && metricResolversData[tree.name?.value]) return metricResolversData[tree.name?.value](tree, query)
    if (tree.alias?.value) name = tree.alias?.value;
    query.metrics[`${name}`] = `${query.path}${!!query.path ? '.' : ''}${name}`;
  }
}

function mergeDimension(tree, query) {
  const args = argumentsToObject(tree.arguments);

  if (args?.type === 'Array') {
    if (!!args?.cutoff) {
      query.cutoff = `${query.path}${!!query.path ? '.' : ''}[@${tree.name.value}=:${tree.name.value}]`
    }
    query.path += `${!!query.path ? '.' : ''}[@${tree.name.value}=:${tree.name.value}]`
  } else {
    query.path += `${!!query.path ? '.' : ''}:${tree.name.value}`
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
}
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
function progressiveSet(object, queryPath, value) {

  const pathArray = queryPath.split(/\./).map(p => unshieldSeparator(p));
  const property = pathArray.splice(-1);
  if (queryPath.startsWith("[") && !Array.isArray(object) && Object.keys(object).length === 0) object = [];
  let leaf = object;

  pathArray.forEach((pathStep, i) => {
    if (pathStep.startsWith('[') && !Array.isArray(leaf)) {
      let key = pathStep.slice(1, pathStep.length - 1);

      if (key !== 0 && !key || Number.isInteger(+key)) {
        leaf['arr'] = [];
        leaf = leaf['arr'];
      } else if (key.startsWith("@")) {
        key = key.slice(1);
        const filterBy = key.split('=');
        if (!leaf[filterBy[0]]) leaf[filterBy[0]] = [];
        leaf = leaf[filterBy[0]];
      }

    }
    if (Array.isArray(leaf)) {
      let key = pathStep.slice(1, pathStep.length - 1);
      if (key !== 0 && !key) {
        leaf.push({});
        leaf = leaf[leaf.length - 1];
      } else if (Number.isInteger(+key)) {
        leaf = leaf[+key];
      } else if (key.startsWith("@")) {

        key = key.slice(1);

        const filterBy = key.split('=');
        const found = leaf.find((a) => a[filterBy[0]] == ('' + filterBy[1]))
        if (!!found) {
          leaf = found;
        } else {
          leaf.push({ [filterBy[0]]: filterBy[1] });
          leaf = leaf[leaf.length - 1];
        }

      }
    } else {
      const nextStep = pathArray[i + 1];
      if (!!nextStep && nextStep.startsWith('[') && nextStep.endsWith(']') && !leaf[pathStep]) {
        leaf[pathStep] = [];
      }
      if (!leaf[pathStep]) leaf[pathStep] = {};//todo guess if there should be an array
      leaf = leaf[pathStep];
    }
  })


  leaf[property] = value;
  return object;
}

function withFilters(filters) {
  return (knexPipe) => {
    return filters.reduce((knexNext, filter, i) => {
      if (i === 0) return knexNext.where.apply(knexNext, filter);
      return knexNext.andWhere.apply(knexNext, filter);
    }, knexPipe)
  }
}

function flattenObject(o) {
  const keys = Object.keys(o);
  return keys.length === 1 ? o[keys[0]] : keys.map(k => o[k]);
}

function argumentsToObject(args) {
  if (!args) return null;
  return args.reduce((r, a) => ({ ...r, [a.name.value]: a.value.value }), {})
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
