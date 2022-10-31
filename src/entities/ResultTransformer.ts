import { Merger } from './Merger'
import { ResultProcessor } from './ResultProcessor'

export class ResultTransformer {
  resultProcessors: ResultProcessor[]

  constructor() {
    this.resultProcessors = []
  }

  use(processor: ResultProcessor) {
    this.resultProcessors.push(processor)
  }
}
