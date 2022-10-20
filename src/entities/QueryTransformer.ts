import { QueryProcessor } from './QueryProcessor'

export class QueryTransformer {
  queryProcessors: QueryProcessor[]

  constructor() {
    this.queryProcessors = []
  }

  use(processor: QueryProcessor) {
    this.queryProcessors.push(processor)
  }
}
