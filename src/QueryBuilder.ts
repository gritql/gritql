/*
class query builder that stores as a JSON of manipulations to be done to buld the query
and have a method to Query that is producing the SQL
and a method to execute that is executing the SQL
*/

import { checkPropTypes, PropTypes } from '../types'
import { SourceProvider } from './entities/SourceProvider'
import { PostgresProvider } from './providers/PostgresProvider'

export type QueryInstruction = {
  name: string
  action: Instruction
  arguments: InstructionArguments
  priority: number
}

export type Instruction = ((this, ctx: any, args: any) => any) & {
  name: string
  priority?: number
  argsTypeSpecs?: Object
  keywords?: Array<string>
}

export type InstructionArguments = {
  alias?: string
  args?: any
  priority?: number
}

class Query {
  public queryInstructions: Array<QueryInstruction>
  private initiateContext?: () => any
  private provider: SourceProvider
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
    instructionFunction: Instruction,
    instructionArguments: InstructionArguments,
  ) {
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
        instructionArguments,
        'arguments',
        instructionFunction.name,
      )
    }
    this.queryInstructions.push({
      name: instructionFunction.name,
      action: instructionFunction,
      arguments: instructionArguments,
      priority: instructionArguments.priority || 0,
    })
    return this
  }

  async renderQuery(): Promise<any> {
    const context = this.initiateContext
      ? await this.initiateContext()
      : { promise: Promise.resolve() }
    this.queryInstructions
      .sort(
        (a: QueryInstruction, b: QueryInstruction) => a.priority - b.priority,
      )
      .forEach(async (instruction) => {
        const promise = await instruction.action.call(
          this,
          context,
          instruction.arguments,
        )
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

const sum: Instruction = function sum(this, { promise }, { alias, args }) {
  promise.sum(args.a).as(alias)
  return promise
}
sum.keywords = ['SUM']
sum.argsTypeSpecs = {
  a: PropTypes.string,
}
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
