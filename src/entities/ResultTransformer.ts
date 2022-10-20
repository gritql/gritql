import { Merger } from './Merger'
import { ResultProcessor } from './ResultProcessor'

export class ResultTransformer {
  resultProcessors: ResultProcessor[]
  merger: Merger

  constructor() {
    this.resultProcessors = []
  }

  use(processor: ResultProcessor | Merger) {
    if (processor instanceof Merger) {
      this.merger = processor
    }
    this.resultProcessors.push(processor)
  }
}
