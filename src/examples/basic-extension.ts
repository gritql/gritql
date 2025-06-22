import { Extension, MetricParser, DimensionParser, DirectiveParser } from '../types';

// Example of a basic extension
export const basicMetricsExtension: Extension = {
  name: 'basic-metrics',
  
  metricParsers: [
    {
      name: 'count',
      parse: (field, context) => {
        context.query.select(context.knex?.raw('COUNT(*) as count'));
      }
    },
    {
      name: 'sum',
      parse: (field, context) => {
        const args = field.arguments?.find(arg => arg.name.value === 'field');
        if (args && 'value' in args.value && 'value' in args.value) {
          context.query.select(context.knex?.raw(`SUM(${args.value.value}) as ${field.alias?.value || field.name.value}`));
        }
      }
    },
    {
      name: 'avg',
      parse: (field, context) => {
        const args = field.arguments?.find(arg => arg.name.value === 'field');
        if (args && 'value' in args.value && 'value' in args.value) {
          context.query.select(context.knex?.raw(`AVG(${args.value.value}) as ${field.alias?.value || field.name.value}`));
        }
      }
    }
  ],

  dimensionParsers: [
    {
      name: 'group',
      parse: (field, context) => {
        const args = field.arguments?.find(arg => arg.name.value === 'by');
        if (args && 'value' in args.value && 'value' in args.value) {
          context.query.groupBy(args.value.value as string);
        }
      }
    }
  ],

  hooks: [
    {
      stage: 'beforeExecute',
      handler: (query, context) => {
        console.log('About to execute query:', query);
        return query;
      }
    }
  ]
};

// Example of how to use the extension
/*
import { createGritQL } from '../index';

const gritql = createGritQL({ knex: myKnexInstance })
  .use(basicMetricsExtension);

// Now you can use the metrics in your GraphQL queries:
const result = await gritql.query({
  query: `
    query {
      users {
        count
        totalRevenue: sum(field: "revenue")
        avgAge: avg(field: "age")
        group(by: "country") {
          country
          count
        }
      }
    }
  `
});
*/