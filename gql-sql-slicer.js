const gql = require('graphql-tag');
const knexConstructor = require('knex');
let knex = knexConstructor({ client: 'pg' });
module.exports = function init(opts = { client: 'pg' }) {
  knex = knexConstructor(opts);
}

module.exports.gqlBuild = function gqlBuild(gqlQuery, table) {
  const definitions = gql(gqlQuery).definitions;
  const { query, queryPromise } = buildQueryUp(definitions[0], table)[0];

  return { query, queryPromise, definition: definitions[0] };
}
module.exports.merge = function merge(definition, result) {
  const { metrics, dimensions, dimensionTypes } = buildQueryUp(definition)[0];

  return result.reduce((o, row) => {
    let rowRes = o;
    dimensions.forEach((dimName, i) => {
      const dimValue = row[dimName.toLowerCase()];

      if (!rowRes[dimValue] && dimensionTypes[i] !== 'Array') rowRes[dimValue] = dimensionTypes[i + 1] === 'Array' ? [] : {};


      if (dimensionTypes[i] === 'Array') {
        const idx = rowRes.find(r => r[dimName.toLowerCase()] === dimValue);
        if (!!idx || idx === 0) return rowRes = rowRes[idx];
        let newRes = {};
        newRes[dimName.toLowerCase()] = dimValue;
        rowRes.push(newRes)
        return rowRes = newRes;;
      }

      rowRes = rowRes[dimValue];
    })

    metrics.forEach((m, i) => {
      if (row[m.toLowerCase()]) rowRes[m] = +row[m.toLowerCase()]
    })
    return o;
  }, {})

}

function buildQueryUp(def, table) {
  const { operation, selectionSet: { selections } } = def;
  if (operation === 'query') {
    return selections.map((s) => newQuery(s, table))
  }
  return null;
}
function withFilters(filters) {
  return (knexPipe) => {
    return filters.reduce((knexNext, filter, i) => {
      if (i === 0) return knexNext.where.apply(knexNext, filter);
      return knexNext.andWhere.apply(knexNext, filter);
    }, knexPipe)
  }
}
function withMetrics(metrics) {
  return (knexPipe) => {

    return metrics.reduce((knexNext, metric, i) => {
      if (metric.startsWith('_')) return knexNext.select(knex.raw(metric.slice(1)));
      return knexNext.sum.call(knexNext, `${metric} as ${metric}`);
    }, knexPipe)
  }
}

function buildQuery(filters, metrics, groupings, table, as) {
  return function () {
    let result = withFilters(filters)(withMetrics(metrics)(this.select(knex.raw(groupings.map(r => r.startsWith('_') ? r.slice(1) : `"${r}"`).join(', ')))).from(table)).groupByRaw(groupings.map(r => r.startsWith('_') ? r.slice(1) : `"${r}"`).map(r => r.split(' as ')[0]).join(', '));
    if (!!as) result = result.as(as);
    return result;
  }
}
function newQuery(section, table = 'table') {

  const { arguments: args } = section;

  const filters = args.reduce((res, arg) => {
    if (arg.name.value.endsWith('_gt')) return res.concat([[arg.name.value.replace('_gt', ''), '>', arg.value.value]]);
    if (arg.name.value.endsWith('_gte')) return res.concat([[arg.name.value.replace('_gte', ''), '>=', arg.value.value]]);
    if (arg.name.value.endsWith('_lt')) return res.concat([[arg.name.value.replace('_lt', ''), '<', arg.value.value]]);
    if (arg.name.value.endsWith('_lte')) return res.concat([[arg.name.value.replace('_lte', ''), '<=', arg.value.value]]);
    return res.concat([[arg.name.value, '=', arg.value.value]]);
  }, []);


  const groupings = extractGroupings(section.selectionSet);
  const metrics = extractMetrics(section.selectionSet);
  const metricNames = extractMetricNames(section.selectionSet);
  const dimensionTypes = extractDimensionTypes(section.selectionSet);
  const dimensionNames = extractDimensionNames(section.selectionSet);


  const aggregationHandler = extractAggregationHandler(section.selectionSet);

  if (!!aggregationHandler && aggregationHandler[1]) {
    return aggregationHandler[1](aggregationHandler[0], table, filters, metrics, groupings, dimensionTypes, metricNames);
  }
  const resultQuery = buildQuery(filters, metrics, groupings, table).call(knex);
  return { query: resultQuery.toString(), queryPromise: resultQuery, dimensions: dimensionNames, metrics: metricNames, dimensionTypes };
}

const metricHandlers = {
  divide: (s) => {
    return `_sum("${s.arguments[0].value.value}")/sum("${s.arguments[1].value.value}") as "${s.alias.value}"`;
  }
}

const dimenstionHandlers = {
  aggrAverage: (s, table, filters, metrics, groupings, dimensionTypes, metricNames) => {
    metrics.push(`_"${s.alias.value}"*sum("${s.arguments[0].value.value}") as "aggrAverage"`)
    metricNames.push(`${s.alias.value}_aggrAverage`)
    const outer_dimensions = groupings.filter(g => g !== s.alias.value);
    dimensionTypes.splice(groupings.indexOf(s.alias.value), 1);
    const resultQuery = knex.select(outer_dimensions).select(knex.raw(`sum("aggrAverage")/max("${s.arguments[1].value.value}") as ${s.alias.value}_aggrAverage`))
      .from(buildQuery(filters, metrics, groupings, table, 'middleTable'))
      .groupBy(outer_dimensions)
    return {
      query: resultQuery.toString(),
      queryPromise: resultQuery,
      metrics: metricNames,
      dimensions: outer_dimensions,
      dimensionTypes
    };
  }
}

function extractMetrics(set, arr = []) {
  if (!set.selections[0].selectionSet) {
    return set.selections.map((s) => {
      if (s.alias && metricHandlers[s.name.value]) return metricHandlers[s.name.value](s)
      return s.name.value
    });
  }
  return extractMetrics(set.selections[0].selectionSet, arr);
}
function extractMetricNames(set, arr = []) {
  if (!set.selections[0].selectionSet) {
    return set.selections.map((s) => {
      if (s.alias && metricHandlers[s.name.value]) return s.alias.value;
      return s.name.value
    });
  }
  return extractMetricNames(set.selections[0].selectionSet, arr);
}
function extractDimensionTypes(set, arr = []) {
  if (!set.selections[0].selectionSet) return arr;
  const type = !!set.selections[0].arguments.length && set.selections[0].arguments[0].name.value === 'type' ? set.selections[0].arguments[0].value.value : null;
  if (!!set.selections[0].alias && !!set.selections[0].alias.value) {
    return arr.concat(type, extractDimensionTypes(set.selections[0].selectionSet, arr))
  }
  return arr.concat(type, extractDimensionTypes(set.selections[0].selectionSet, arr))
}

function extractDimensionNames(set, arr = []) {
  if (!set.selections[0].selectionSet) return arr;
  if (!!set.selections[0].alias && !!set.selections[0].alias.value) return arr.concat([set.selections[0].alias.value, set.selections[0].name.value].join('_'), extractDimensionNames(set.selections[0].selectionSet, arr))
  return arr.concat(set.selections[0].name.value, extractDimensionNames(set.selections[0].selectionSet, arr))
}
function extractGroupings(set, arr = []) {
  if (!set.selections[0].selectionSet) return arr;

  if (!!set.selections[0].alias && !!set.selections[0].alias.value) {
    return arr.concat(set.selections[0].alias.value, extractGroupings(set.selections[0].selectionSet, arr))
  }
  const idxGroupBy = set.selections[0].arguments.map(a => a.name.value).indexOf('groupBy');
  if (!!~idxGroupBy) {
    const fieldName = set.selections[0].name.value;
    const groupType = set.selections[0].arguments[idxGroupBy].value.value;
    return arr.concat(`_date_trunc('${groupType}', "${fieldName}") as "${fieldName}"`, extractGroupings(set.selections[0].selectionSet, arr))
  }
  return arr.concat(set.selections[0].name.value, extractGroupings(set.selections[0].selectionSet, arr))
}
function extractAggregationHandler(set, result) {
  if (!set.selections[0].selectionSet) return null;
  if (!!set.selections[0].alias && !!set.selections[0].alias.value && dimenstionHandlers[set.selections[0].name.value]) return [set.selections[0], dimenstionHandlers[set.selections[0].name.value]];
  return extractAggregationHandler(set.selections[0].selectionSet, result);
}

function flattenObject(o) {
  const keys = Object.keys(o);
  return keys.length === 1 ? o[keys[0]] : keys.map(k => o[k]);
}

function argumentsToObject(args) {
  return args.reduce((r, a) => ({ ...r, [a.name.value]: a.value.value }), {})
}
