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
  const { metrics, dimensions, dimensionTypes, dimensionFormats } = buildQueryUp(definition, null)[0];

  return result.reduce((o, row) => {
    let rowRes = o;


    dimensions.forEach((dimName, i) => {
      if (!!~dimName.indexOf(" as ")) dimName = dimName.split(" as ")[1].slice(1, -1);
      let dimValue = row[dimName.toLowerCase()];

      if (!rowRes[dimValue] && dimensionTypes[i] !== 'Array') rowRes[dimValue] = dimensionTypes[i + 1] === 'Array' ? [] : {};


      if (dimensionTypes[i] === 'Array') {
        if (i === 0 && !Array.isArray(o)) {
          o = [];
          rowRes = o;
        }
        const idx = rowRes.find(r => r[dimName.toLowerCase()] === dimValue);
        if (!!idx || idx === 0) return rowRes = rowRes[idx];
        let newRes = {};
        newRes[dimName.toLowerCase()] = dimValue;
        rowRes.push(newRes)
        return rowRes = newRes;
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

function buildQuery(filters, metrics, groupings, table, as, dimensionsGrouping) {
  return function () {

    let result = null;
    if (!groupings.length) {
      result = withFilters(filters)(withMetrics(metrics)(this.select().from(table)));
    } else {
      result = withFilters(filters)(withMetrics(metrics)(this.select(knex.raw(groupings.map(r => r.startsWith('_') ? r.slice(1) : `"${r}"`).join(', ')))).from(table)).groupByRaw(dimensionsGrouping.map(r => r.startsWith('_') ? r.slice(1) : `"${r}"`).map(r => r.split(' as ')[0]).join(', '));
    }

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
  const dimensionsGrouping = extractDimensionGroupings(section.selectionSet);
  const metrics = extractMetrics(section.selectionSet);
  const metricNames = extractMetricNames(section.selectionSet);
  const dimensionTypes = extractDimensionTypes(section.selectionSet);
  const dimensionNames = extractDimensionNames(section.selectionSet);
  const dimensionFormats = extractDimensionFormats(section.selectionSet);

  const aggregationHandler = extractAggregationHandler(section.selectionSet, null);

  if (!!aggregationHandler && aggregationHandler[1]) {
    return aggregationHandler[1](aggregationHandler[0], table, filters, metrics, groupings, dimensionTypes, metricNames, dimensionFormats, dimensionsGrouping);
  }
  const resultQuery = buildQuery(filters, metrics, groupings, table, null, dimensionsGrouping).call(knex);
  return { query: resultQuery.toString(), queryPromise: resultQuery, dimensions: dimensionNames, metrics: metricNames, dimensionTypes, dimensionFormats };
}

const metricHandlers = {
  divide: (s) => {
    return `_cast(sum("${s.arguments[0].value.value}") as float)/cast(sum("${s.arguments[1].value.value}") as float) as "${s.alias.value}"`;
  }
}

const dimenstionHandlers = {
  aggrAverage: (s, table, filters, metrics, groupings, dimensionTypes, metricNames, dimensionFormats, dimensionsGrouping) => {
    metrics.push(`_"${s.alias.value}"*sum("${s.arguments[0].value.value}") as "aggrAverage"`)
    metricNames.push(`${s.alias.value}_aggrAverage`)
    const outer_dimensions = groupings.filter(g => g !== s.alias.value).map(g => !!~g.indexOf(' as ') ? g.split(" as ")[1].slice(1, -1) : g);
    dimensionTypes.splice(groupings.indexOf(s.alias.value), 1);
    const resultQuery = knex.select(outer_dimensions).select(knex.raw(`sum("aggrAverage")/max("${s.arguments[1].value.value}") as ${s.alias.value}_aggrAverage`))
      .from(buildQuery(filters, metrics, groupings, table, 'middleTable', dimensionsGrouping))
      .groupBy(outer_dimensions)
    return {
      query: resultQuery.toString(),
      queryPromise: resultQuery,
      metrics: metricNames,
      dimensions: outer_dimensions,
      dimensionTypes,
      dimensionFormats
    };
  },
  distinct: (s, table, filters, metrics, groupings, dimensionTypes, metricNames, dimensionFormats, dimensionsGrouping) => {

    const resultQuery = knex(table).distinct(s.alias.value);
    return {
      query: resultQuery.toString(),
      queryPromise: resultQuery,
      metrics: metricNames,
      dimensions: groupings,
      dimensionTypes,
      dimensionFormats
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
function extractDimensionFormats(set, arr = []) {
  if (!set.selections[0].selectionSet) return arr;

  const allArguments = !!set.selections[0].arguments.length && set.selections[0].arguments.map(a => ({ name: a.name.value, value: a.value.value })) || [];

  const format = allArguments.filter(a => a.name == 'format')[0];

  if (!!set.selections[0].alias && !!set.selections[0].alias.value) {
    return arr.concat(format && format.value, extractDimensionFormats(set.selections[0].selectionSet, arr))
  }
  return arr.concat(format && format.value, extractDimensionFormats(set.selections[0].selectionSet, arr))
}


function extractDimensionNames(set, arr = []) {
  if (!set.selections[0].selectionSet) return arr;
  if (!!set.selections[0].alias && !!set.selections[0].alias.value) return arr.concat([set.selections[0].alias.value, set.selections[0].name.value].join('_'), extractDimensionNames(set.selections[0].selectionSet, arr))
  return arr.concat(set.selections[0].name.value, extractDimensionNames(set.selections[0].selectionSet, arr))
}

function extractDimensionGroupings(set, arr = []) {
  if (!set.selections[0].selectionSet) return arr;

  if (!!set.selections[0].alias && !!set.selections[0].alias.value) {
    return arr.concat(set.selections[0].alias.value, extractDimensionGroupings(set.selections[0].selectionSet, arr))
  }
  const idxGroupBy = set.selections[0].arguments.map(a => a.name.value).indexOf('groupBy');
  const idxFormat = set.selections[0].arguments.map(a => a.name.value).indexOf('format');
  if (!!~idxGroupBy) {
    const fieldName = set.selections[0].name.value;
    const groupType = set.selections[0].arguments[idxGroupBy].value.value;

    return arr.concat(`_date_trunc('${groupType}', "${fieldName}") as "${fieldName}"`, extractDimensionGroupings(set.selections[0].selectionSet, arr))
  }

  return arr.concat(set.selections[0].name.value, extractDimensionGroupings(set.selections[0].selectionSet, arr))
}
function extractGroupings(set, arr = []) {
  if (!set.selections[0].selectionSet) return arr;

  if (!!set.selections[0].alias && !!set.selections[0].alias.value) {
    return arr.concat(set.selections[0].alias.value, extractGroupings(set.selections[0].selectionSet, arr))
  }
  const idxGroupBy = set.selections[0].arguments.map(a => a.name.value).indexOf('groupBy');
  const idxFormat = set.selections[0].arguments.map(a => a.name.value).indexOf('format');
  if (!!~idxGroupBy) {
    const fieldName = set.selections[0].name.value;
    const groupType = set.selections[0].arguments[idxGroupBy].value.value;
    if (!!~idxFormat) {
      const format = set.selections[0].arguments[idxFormat].value.value;
      return arr.concat(`_to_char(date_trunc('${groupType}', "${fieldName}"), '${format}') as "${fieldName}"`, extractGroupings(set.selections[0].selectionSet, arr))
    }
    return arr.concat(`_date_trunc('${groupType}', "${fieldName}") as "${fieldName}"`, extractGroupings(set.selections[0].selectionSet, arr))
  }
  if (!!~idxFormat) {
    const fieldName = set.selections[0].name.value;
    const format = set.selections[0].arguments[idxFormat].value.value;
    return arr.concat(`_to_char(${fieldName}, '${format}') as "${fieldName}"`, extractGroupings(set.selections[0].selectionSet, arr))
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
