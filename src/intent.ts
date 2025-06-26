import type { Knex } from 'knex'

// Ultra-minimal: ~50 lines with grouping!
type Step = { type: string; args: any[]; name?: string; steps?: Step[] }

export const createQueryBuilder = (steps: Step[] = []) => {
  const proxy: any = new Proxy(
    {},
    {
      get(_, prop: string) {
        switch (prop) {
          case 'getSteps':
            return () => [...steps]
          case 'toKnex':
            return (knex: Knex) => {
              const qb = knex.queryBuilder()
              const executeStep = (s: Step) => {
                if (s.steps) s.steps.forEach(executeStep)
                else (qb as any)[s.type]?.(...s.args)
              }
              steps.forEach(executeStep)
              return qb
            }
          case 'toSQL':
            return (knex: Knex) => proxy.toKnex(knex).toQuery()
          case 'execute':
            return (knex: Knex) => proxy.toKnex(knex)
          case 'remove':
            return (id: number | string) =>
              createQueryBuilder(
                steps.filter((_, i) =>
                  typeof id === 'number' ? i !== id : _.name !== id,
                ),
              )
          case 'name':
            return (n: string) => {
              if (steps.length) steps[steps.length - 1].name = n
              return createQueryBuilder([...steps])
            }
          case 'startGroup':
            return () =>
              createQueryBuilder([
                ...steps,
                { type: '__START_GROUP', args: [] },
              ])
          case 'endGroup':
            return () => {
              let startIdx = -1
              for (let i = steps.length - 1; i >= 0; i--) {
                if (steps[i].type === '__START_GROUP') {
                  startIdx = i
                  break
                }
              }
              if (startIdx === -1) return createQueryBuilder(steps)
              const beforeGroup = steps.slice(0, startIdx)
              const groupSteps = steps.slice(startIdx + 1)
              return createQueryBuilder([
                ...beforeGroup,
                { type: '__GROUP', args: [], steps: groupSteps },
              ])
            }
          case 'clone':
            return () => createQueryBuilder([...steps])
          default:
            return (...args: any[]) =>
              createQueryBuilder([...steps, { type: prop, args }])
        }
      },
    },
  )
  return proxy
}

export const query = () => createQueryBuilder()
