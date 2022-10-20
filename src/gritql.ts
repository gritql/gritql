import { Merger } from './entities/Merger'
import { QueryProcessor } from './entities/QueryProcessor'
import { QueryTransformer } from './entities/QueryTransformer'
import { ResultProcessor } from './entities/ResultProcessor'
import { ResultTransformer } from './entities/ResultTransformer'
import { SourceProvider } from './entities/SourceProvider'
import { PostgresProvider } from './providers/PostgresProvider'

class Runner {}

class GritQL {
  sourceProviders: SourceProvider[]
  public queryTransformer: QueryTransformer
  public resultTransformer: ResultTransformer

  runner: Runner

  constructor() {
    this.sourceProviders = []
    this.queryTransformer = new QueryTransformer()
    this.resultTransformer = new ResultTransformer()
  }

  use(provider: SourceProvider) {
    this.sourceProviders.push(provider)
  }
}

const postgresqlProvider = new PostgresProvider({})
const merger = new Merger()
const someProcessor = new QueryProcessor()
const someResProcessor = new ResultProcessor()

const qritQLEngine = async () => {
  const gritql = new GritQL()

  gritql.use(postgresqlProvider)

  const { queryTransformer, resultTransformer } = gritql

  queryTransformer.use(someProcessor)

  resultTransformer.use(someResProcessor)
  resultTransformer.use(merger)

  return gritql
}

console.log(qritQLEngine())
