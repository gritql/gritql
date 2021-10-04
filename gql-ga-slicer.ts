

import { DateTime } from 'luxon';

export function gaQueryBuilder(table, tree, queries: Array<any> | undefined = [], idx: number | undefined = undefined, knex, metricResolvers) {
  //console.log(queries.map(q => q.promise._statements))
  //console.log(tree, idx, queries)
  //console.log(queries, idx, tree.length)
  if (!!~idx && idx !== undefined && !queries[idx]) queries[idx] = { idx, name: undefined, source: 'GA' };
  const query = queries[idx];
  if (Array.isArray(tree)) {
    //we replace query with next level
    return tree.reduce((queries, t, i) => gaQueryBuilder(table, t, queries, queries.length - 1, knex, metricResolvers), queries);
  }

  if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
    if (tree.operation === 'query' && !!tree.name?.value) {
      table = tree.name?.value
    }
    if (tree.operation === 'mutation') return queries;
    return tree.selectionSet.selections.reduce((queries, t, i) => gaQueryBuilder(table, t, queries, queries.length, knex, metricResolvers), queries);
  }

  if (!query.filters && tree.name.value === 'fetch') {
    query.name = tree.alias?.value || null;
    query.table = table;
    query.dimensions = [];
    query.metrics = [];
    query.orderBys = [];
    query.postQueryTransform = [];
    query.filters = parseFilters(tree);
    if (!tree.selectionSet?.selections) throw "The query is empty, you need specify metrics or dimensions";
    let contextQuery = query;
    query.generatePromise = (query) => {
      const preparedFilters = query.filters.reduce((r, f) => {
        r[f[0].replace("_", "-")] = f[2];
        return r;
      }, {});

      const request = {
        ...preparedFilters,
        dimensions: query.dimensions.reduce(arrayToGaString, ''),
        metrics: query.metrics.reduce(arrayToGaString, ''),
        sort: query.orderBys.length > 0 ? (query.orderBys.reduce(arrayToGaString, '')) : undefined
      }

      const thePromise = (new Promise((resolve, reject) => {
        resolve(request);
      })).catch(e => console.log(e));
      thePromise.toString = () => request;
      return thePromise;
    }
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
        if (!!query.sort) queries[newIdx].sort = JSON.parse(JSON.stringify(query.sort));

        queries[newIdx].idx = newIdx;
        return gaQueryBuilder(table, t, queries, newIdx, knex, metricResolvers);
      }
      return gaQueryBuilder(table, t, queries, idx, knex, metricResolvers)
    }, queries);
  }
  parseMetric(tree, query, knex, metricResolvers);
  return queries
}

function parseMetric(tree, query, knex, metricResolvers) {
  const { metrics = [] } = query;
  if (tree.alias && metricResolvers[tree.name?.value]) return metricResolvers[tree.name?.value](tree, query, knex)
  query.metrics = metrics;
  query.metrics.push(tree.name?.value);
}

function parseDimension(tree, query, knex) {
  const { dimensions = [] } = query;
  if (!query.groupIndex) query.groupIndex = 0;
  query.groupIndex++;
  const args = argumentsToObject(tree.arguments);

  if (args?.groupBy) {
    query.postQueryTransform.push((result) => {
      return result.reduce((r, l) => {
        const newDate = DateTime.fromISO(l[tree.name.value]).startOf(args?.groupBy).toISODate();
        l = { ...l, [tree.name.value]: newDate }
        const nonNumeric = getNonNumericKeys(l);
        const line = r.find(matchNonNumeric([...nonNumeric, tree.name.value], l));
        if (!line) {
          r.push({ ...l });
        } else {
          Object.keys(l).forEach(key => {
            if (!~nonNumeric.indexOf(key)) line[key] = !!line[key] ? (+line[key] + +l[key]) : +l[key]
          });
        }
        return r;
      }, [])
    })
  }

  if (!!args?.sort_desc) query.orderBys = (query.orderBys || []).concat(`-${args?.sort_desc}`);
  if (!!args?.sort_asc) query.orderBys = (query.orderBys || []).concat(args?.sort_asc);

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

function getNonNumericKeys(l) {
  return Object.keys(l).filter((k) => isNaN(+l[k]))
}
function matchNonNumeric(keys, compareLine) {
  return (line) => {
    return !keys.reduce((r, k) => r || line[k] !== compareLine[k], false)
  }
}

function argumentsToObject(args) {
  if (!args) return null;
  return args.reduce((r, a) => ({ ...r, [a.name.value]: a.value.value }), {})
}

function arrayToGaString(r, el, i) {
  return r + el.replace(/^(-?)(\w)/, (i === 0 ? '' : ',') + "$1ga:$2");
}


export const gaMetricResolvers = {
  divide: (tree, query, knex) => {
    if (!tree.arguments) throw "Sum function requires arguments";
    const args = argumentsToObject(tree.arguments);
    if (!args.a) throw "Sum function requires 'a' as argument";
    if (!args.by) throw "Sum function requires 'by' as argument";
    query.postQueryTransform.push((result) => {
      return result.map(l => ({ ...l, [tree.alias.value]: l[args.a] / l[args.by] }))
    })
    if (!~query.metrics.indexOf(args.a)) query.metrics.push(args.a)
    if (!~query.metrics.indexOf(args.by)) query.metrics.push(args.by)
  },
  indexed: (tree, query, knex) => {
    if (!tree.arguments) throw "Indexed function requires arguments";
    const args = argumentsToObject(tree.arguments);
    if (!args.a) throw "Indexed  function requires 'a' as argument";
    //if (!!args.by) throw "Indexed  function doesnot support 'a' as argument";
    query.postQueryTransform.push((result) => {
      const maxValue = Math.max(...result.map((l) => l[args.a]))
      return result.map(l => ({ ...l, [tree.alias.value]: l[args.a] / maxValue }))
    })
    if (!~query.metrics.indexOf(args.a)) query.metrics.push(args.a)
  }
}