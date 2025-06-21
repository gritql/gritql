/*
class query builder that stores as a JSON of manipulations to be done to buld the query
and have a method to Query that is producing the SQL
and a method to execute that is executing the SQL
*/

import { checkPropTypes } from '../types'
import { SourceProvider } from './entities/SourceProvider'
//import { PostgresProvider } from './providers/PostgresProvider'
import { Instruction, sum } from './Instructions/basic'

type QueryAction = {
  instruction: Instruction
  args: Object
  priority?: number
}

class Query {
  public queryInstructions: Array<QueryAction>
  private initiateContext?: () => any
  public provider: SourceProvider
  public idx: number
  public name: string

  constructor(provider: SourceProvider, initiateContext?: () => any) {
    this.queryInstructions = []
    this.initiateContext = initiateContext
    this.provider = provider
  }

  setInitiateContext(initiateContext: () => any) {
    this.initiateContext = initiateContext
  }

  duplicate(): Query {
    const query = new Query(this.provider, this.initiateContext)
    query.queryInstructions = [...this.queryInstructions]
    return query
  }

  do(
    instructionFunction: Instruction | string,
    instructionArguments: { args: Object; alias: string; name?: string },
  ) {
    if (typeof instructionFunction === 'string') {
      instructionFunction = this.provider.getInstruction(instructionFunction)
    }
    //verify instructions match provider
    if (this.provider) {
      if (
        instructionFunction.keywords &&
        !instructionFunction.keywords.every((keyword) =>
          this.provider.keywords.includes(keyword),
        )
      ) {
        throw new Error(
          `${this.provider.name} provider doesn't support ${instructionFunction.name} function`,
        )
      }
    }
    //verify arguments match instruction
    if (instructionFunction.argsTypeSpecs) {
      checkPropTypes(
        instructionFunction.argsTypeSpecs,
        instructionArguments.args,
        'arguments',
        instructionFunction.name,
      )
    }
    this.queryInstructions.push({
      instruction: instructionFunction,
      args: instructionArguments,
    })
    return this
  }

  async renderQuery(): Promise<any> {
    const context = this.initiateContext
      ? await this.initiateContext()
      : { promise: Promise.resolve() }
    this.queryInstructions
      .sort(
        (a: QueryAction, b: QueryAction) =>
          (a.priority || a.instruction.priority || 100) -
          (b.priority || b.instruction.priority || 100),
      )
      .forEach(async (action, i) => {
        const promise = action.instruction.call(this, context, action.args)
        context.promise = promise
      })
    return context
  }
}

export default Query
/*
const provider = new PostgresProvider({})
const query = new Query(provider, () => {
  const knex = provider.getQueryBuilder()
  const promise = knex('table')
  return { promise, knex }
})

query.do(sum, { alias: 'a', args: { a: 'a' }, priority: 0 })
const duplecate = query.duplicate()

query.do(sum, { alias: 'a', args: { a: 'test' }, priority: 0 })
duplecate.do(sum, { alias: 'a', args: { a: 'test1' }, priority: 0 })

query.renderQuery().then((context) => {
  console.log(context.promise.toSQL().sql)
})

duplecate.renderQuery().then((context) => {
  console.log(context.promise.toSQL().sql)
})
*/
