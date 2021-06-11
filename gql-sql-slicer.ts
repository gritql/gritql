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

interface metricResolver {
  (tree, query, knex): void
}

interface metricDataResolver {
  (tree, query): void
}

export const gqlToDb = (opts: any = { client: 'pg' }) => {
  const knex = knexConstructor(opts);
  let beforeDbHandler: BeforeDbHandler = (r) => Promise.resolve(r);
  let dbHandler: DbHandler = ({ queries }) => Promise.all(queries.map(q => q.promise))
  let customMetricResolvers = {};
  let customMetricDataResolvers = {};
  const gqlFetch = async (gqlQuery: string): Promise<any> => {

    try {
      const definitions = gql(gqlQuery).definitions;

      const queries = queryBuilder(null, definitions, undefined, undefined, knex, { ...metricResolvers, ...customMetricResolvers })
        .filter(q => !q.skip)
        .map(q => {
          if (q.postQueryProcessing) q.postQueryProcessing(definitions, q, knex);
          return q;
        });
      const sql = queries.map(q => q.promise.toString())
      const preparedGqlQuery = await beforeDbHandler({ queries, sql, definitions });
      if (!preparedGqlQuery) return null;
      const resultFromDb = await dbHandler(preparedGqlQuery);
      if (!resultFromDb) return null;
      return await merge(definitions, resultFromDb, { ...metricResolversData, ...customMetricDataResolvers })
    } catch (e) {
      console.log(e)
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
  gqlFetch.useResolver = (name: string, fn: metricResolver) => {
    customMetricResolvers = { ...customMetricResolvers, [name]: fn }
  }
  gqlFetch.useDataResolver = (name: string, fn: metricDataResolver) => {
    customMetricDataResolvers = { ...customMetricDataResolvers, [name]: fn }
  }

  return gqlFetch;
}


function queryBuilder(table, tree, queries: Array<any> | undefined = [], idx: number | undefined = undefined, knex, metricResolvers) {
  //console.log(queries.map(q => q.promise._statements))
  //console.log(tree, idx, queries)
  //console.log(queries, idx, tree.length)
  if (!!~idx && idx !== undefined && !queries[idx]) queries[idx] = { idx, name: undefined };
  const query = queries[idx];
  if (Array.isArray(tree)) {
    //we replace query with next level
    return tree.reduce((queries, t, i) => queryBuilder(table, t, queries, queries.length - 1, knex, metricResolvers), queries);
  }
  if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
    if (tree.operation === 'query' && !!tree.name?.value) table = tree.name?.value
    if (tree.operation === 'mutation') return queries;
    return tree.selectionSet.selections.reduce((queries, t, i) => queryBuilder(table, t, queries, queries.length, knex, metricResolvers), queries);
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
        return queryBuilder(table, t, queries, newIdx, knex, metricResolvers);
      }
      return queryBuilder(table, t, queries, idx, knex, metricResolvers)
    }, queries);
  }
  parseMetric(tree, query, knex, metricResolvers);
  return queries
}
function parseMetric(tree, query, knex, metricResolvers) {
  const { metrics = [] } = query;
  query.metrics = metrics;
  if (tree.alias && metricResolvers[tree.name?.value]) return metricResolvers[tree.name?.value](tree, query, knex)
  if (!tree.alias?.value) {
    query.promise = query.promise.select(`${tree.name.value}`)
  } else {
    query.promise = query.promise.select(`${tree.name.value} as ${tree.alias.value}`)
  }

  query.metrics.push(tree.name?.value);

}

function parseDimension(tree, query, knex) {
  const { dimensions = [] } = query;
  if (!query.groupIndex) query.groupIndex = 0;
  query.groupIndex++;
  const args = argumentsToObject(tree.arguments);

  if (args?.groupBy) {
    query.promise = query.promise.select(knex.raw(`date_trunc(?, ??) as ??`, [args?.groupBy, tree.name.value, tree.name.value]));
    query.promise = query.promise.groupBy(knex.raw(`??`, [tree.name.value]));
    if (!query.replaceWith) query.replaceWith = {};
    query.replaceWith[tree.name.value] = { value: knex.raw(`date_trunc(?, ??)`, [args?.groupBy, tree.name.value]), index: query.groupIndex }
    query.postQueryProcessing = (tree, query, knex) => {
      let internal = query.promise;
      query.promise = knex.select([...query.metrics.map(m => knex.raw(`sum(??) as ??`, [m, m])), ...query.dimensions])
        .from(internal.as('middleTable')).groupBy(query.dimensions)
      if (!!args?.sort_desc) query.promise.orderBy(args?.sort_desc, 'desc');
      if (!!args?.sort_asc) query.promise.orderBy(args?.sort_asc, 'asc');
    }
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
    if (arg.name.value.endsWith('_like')) return res.concat([[arg.name.value.replace('_like', ''), 'LIKE', arg.value.value]]);
    if (arg.name.value.endsWith('_in')) return res.concat([[arg.name.value.replace('_in', ''), 'in', arg.value.value.split('|')]]);
    return res.concat([[arg.name.value, '=', arg.value.value]]);
  }, []);
}
const metricResolvers = {
  sum: (tree, query, knex) => {
    if (!tree.arguments) throw "Sum function requires arguments";
    const args = argumentsToObject(tree.arguments);
    if (!args.a) throw "Sum function requires 'a' as argument";
    query.promise = query.promise.sum(`${args.a} as ${tree.alias.value}`);
    query.metrics.push(tree.alias.value);
  },
  avg: (tree, query, knex) => {
    //TODO: test
    if (!tree.arguments) throw "Avg function requires arguments";
    const args = argumentsToObject(tree.arguments);
    if (!args.a) throw "Avg function requires 'a' as argument";

    if (!!args.by) {
      query.promise.select(knex.raw(`avg(??) over (partition by ??) as ??`, [args.a, args.by, tree.alias.value]));
    } else {
      query.promise = query.promise.avg(`${args.a} as ${tree.alias.value}`);
    }
    query.metrics.push(tree.alias.value);
  },
  avgPerDimension: (tree, query, knex) => {
    if (!tree.arguments) throw "avgPerDimension function requires arguments";
    const args = argumentsToObject(tree.arguments);
    if (!args.a) throw "avgPerDimension function requires 'a' as argument";

    if (!args.per) throw "avgPerDimension function requires 'per' as argument";
    query.promise.select(knex.raw(`sum(??)::float/COUNT(DISTINCT ??) as ??`, [args.a, args.per, tree.alias.value]));
  },
  share: (tree, query, knex) => {
    if (!tree.arguments) throw "Share function requires arguments";
    const args = argumentsToObject(tree.arguments);
    if (!args.a) throw "Share  function requires 'a' as argument";
    let partition = '';
    if (!!args.by) {
      let partitionBy = args.by;
      if (query.replaceWith?.[args.by]) {
        partitionBy = query.replaceWith[args.by].value;
      }
      partition = knex.raw(`partition by ??`, [partitionBy]);
    }
    query.promise = query.promise.select(knex.raw(`sum(??)/NULLIF(sum(sum(??)) over (${partition}), 0) as ??`, [args.a, args.a, tree.alias.value]));
    query.metrics.push(tree.alias.value);

  },
  indexed: (tree, query, knex) => {
    if (!tree.arguments) throw "Share function requires arguments";
    const args = argumentsToObject(tree.arguments);
    if (!args.a) throw "Share  function requires 'a' as argument";
    let partition = '';
    if (!!args.by) partition = knex.raw(`partition by ??`, [args.by]);
    query.promise = query.promise.select(knex.raw(`sum(??)/NULLIF(max(sum(??)::float) over (${partition}), 0) as ??`, [args.a, args.a, tree.alias.value]));
    query.metrics.push(tree.alias.value);
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
    query.metrics.push(tree.alias.value);
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
export const merge = (tree: Array<TagObject>, data: Array<any>, metricResolversData): any => {
  const queries = getMergeStrings(tree, undefined, undefined, metricResolversData);

  const mutations = queries.filter((q) => !!q.mutation).reduce((result, query) => {

    if (query.filters?.from) {
      result[query.filters.from] = query;
    } else {
      result[query.name] = query;
    }
    return result;
  }, {});

  const batches = queries.filter(q => !q.mutation).reduce((r, q, i) => {
    const key = q.name || "___query";
    if (!r[key]) r[key] = [];
    q.bid = i;
    r[key].push(q);
    return r;
  }, {})

  function getMergedObject(quer, mutations, fullObject) {

    return quer.reduce((result, q, i) => {
      const resultData = data[q.bid];
      let skipArray = [];
      for (var j = 0; j < resultData.length; j++) {
        const keys = Object.keys(resultData[j]);

        for (var key in keys) {

          //todo: rm
          if (keys[key] === 'cutoff' && +resultData[j][keys[key]] < 0.005) {
            skipArray.push(replVars(q.cutoff, resultData[j]))
          }
          if (q.metrics[keys[key]]) {
            const replacedPath = replVars(q.metrics[keys[key]], resultData[j]);

            const valueDir = replacedPath.slice(0, -(keys[key].length + 1));
            //todo: rm
            if (skipArray.includes(valueDir)) continue;
            const value = isNaN(+resultData[j][keys[key]]) ? resultData[j][keys[key]] : +resultData[j][keys[key]];
            if (!!mutations) {
              const checks = mutations[mutations.mutationFunction];

              const skip = Object.keys(checks).reduce((r, k) => {
                if (r) return r;
                //relying on pick by fix that
                return !checks[k](progressiveGet(fullObject[mutations.filters.by], replVars(k, resultData[j])))
              }, false)
              if (skip) continue;
            }
            result = progressiveSet(result, replacedPath, value)
          }
        }
      }
      return result;

    }, {})
  }

  if (Object.keys(batches).length === 1 && !!batches["___query"]) {
    return getMergedObject(queries, null, null);
  }
  const res = Object.keys(batches).reduce((r, k) => {
    r[k.replace('___query', '')] = getMergedObject(batches[k], null, null)
    if (mutations[k]) r[mutations[k].name] = getMergedObject(batches[k], mutations[k], r)
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


function getMergeStrings(tree, queries = [], idx = undefined, metricResolversData) {

  if (!!~idx && idx !== undefined && !queries[idx]) queries[idx] = { idx, name: undefined };
  const query = queries[idx];
  if (Array.isArray(tree)) {

    return tree.reduce((queries, t, i) => getMergeStrings(t, queries, queries.length - 1, metricResolversData), queries);
  }
  if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
    return tree.selectionSet.selections.reduce((queries, t, i) => {
      if (tree.operation === 'mutation') {
        queries.push({ idx: queries.length, name: undefined, mutation: true, metrics: {}, path: '' });
      } else {
        queries.push({ idx: queries.length, name: undefined });
      }
      return getMergeStrings(t, queries, queries.length - 1, metricResolversData)
    }, queries);
  }

  if (!query.filters && tree.name.value === 'fetch') {
    query.name = tree.alias?.value || null;
    query.metrics = {};
    query.path = '';

    if (!tree.selectionSet?.selections) throw "The query is empty, you need specify metrics or dimensions";
  }

  if (query.mutation && !query.filters) {
    query.filters = argumentsToObject(tree.arguments);
    query.name = tree.alias?.value || null;
    query.mutationFunction = tree.name?.value || null;
  }

  if (query.name === undefined && !query.mutation) throw "Cant find fetch in the payload";

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
        return getMergeStrings(t, queries, newIdx, metricResolversData);
      }

      return getMergeStrings(t, queries, idx, metricResolversData)
    }, queries);
  }
  mergeMetric(tree, query, metricResolversData);
  return queries
}

function mergeMetric(tree, query, metricResolversData) {
  let name = tree.name.value;
  const args = argumentsToObject(tree.arguments);
  if (args?.type === 'Array') {
    if (tree.alias?.value) name = tree.alias?.value;
    query.path += `${!!query.path ? '.' : ''}[@${name}=:${name}]`
    query.metrics[`${name}`] = `${query.path}${!!query.path ? '.' : ''}${name}`;

  } else {
    if (!!query.mutation) return metricResolversData[query.mutationFunction](tree, query);
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
const comparisonFunction = {
  'gt': (v) => (x) => +x > +v,
  'lt': (v) => (x) => +x < +v,
  'gte': (v) => (x) => +x >= +v,
  'lte': (v) => (x) => +x <= +v
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
  pick: (tree, query) => {
    const name = `${tree.name?.value}`;
    const args = argumentsToObject(tree.arguments);
    if (!query.pick) query.pick = {};
    if (query.path === ':pick') query.path = '';
    Object.keys(args).map((key) => {
      const [keyName, operator] = key.split('_');
      query.pick[`${query.path}${!!query.path ? '.' : ''}:${name}.${keyName}`] = comparisonFunction[operator](args[key])

    })
  }
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
function progressiveGet(object, queryPath) {
  const pathArray = queryPath.split(/\./).map(p => unshieldSeparator(p));
  return pathArray.reduce((r, pathStep, i) => {
    if (Array.isArray(r)) {
      return r.find((o) => Object.values(o).includes(pathStep))
    }
    if (!r) return NaN;
    return r[pathStep]
  }, object)
}

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
      if (i === 0) {
        if (filter[1] === 'in') return knexNext.whereIn.apply(knexNext, filter.filter(a => a !== 'in'));
        return knexNext.where.apply(knexNext, filter);
      }
      if (filter[1] === 'in') return knexNext.whereIn.apply(knexNext, filter.filter(a => a !== 'in'));
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
