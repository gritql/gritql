import { QueryProcessor } from './QueryProcessor'

interface metricResolver {
  (tree, query, builder): void
}
export class QueryTransformer {
  queryProcessors: QueryProcessor[]

  constructor() {
    this.queryProcessors = []
  }

  build(
    table,
    tree,
    queries: Array<any> | undefined = [],
    idx: number | undefined = undefined,
    builder,
    options: {
      metricResolvers: Record<string, metricResolver>
      dimensionResolvers: Record<string, metricResolver>
      providers: Record<string, any>
      provider: string
    },
    context = {
      fragments: {},
      types: {},
      variablesValidator: {},
      variables: {},
      typeDefinitions: {},
    },
  ): Array<any> {
    return []
  }

  use(processor: QueryProcessor) {
    this.queryProcessors.push(processor)
  }
}
