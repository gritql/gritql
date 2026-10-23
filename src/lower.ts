/**
 * Plan → Physical[] (SPEC §6.1, §6.2).
 *
 * One statement per grain: the dimension path from the fetch root down to a
 * selection set that holds metrics. `with`, `fetchPlain` and `unionall`
 * fetches are lowered as one statement at their finest grain.
 */
import { GritqlError } from './errors'
import type { Fetch, Node, Physical, Plan } from './model'

export function lower(plan: Plan): Physical[] {
  const out: Physical[] = []
  const withAliases = new Set(plan.fetches.filter((f) => f.kind === 'with' && f.alias).map((f) => f.alias as string))

  for (const fetch of plan.fetches) {
    const before = out.length
    if (fetch.kind === 'with' || fetch.kind === 'fetchPlain') {
      const grain: Node[] = []
      const metrics: Node[] = []
      flatten(fetch.tree, grain, metrics)
      out.push(physical(fetch, out.length, grain, metrics, []))
    } else {
      walk(fetch, fetch.tree, [], [], out)
    }
    const ctes = dependencies(fetch, plan, withAliases)
    for (let i = before; i < out.length; i++) out[i].ctes = ctes
  }
  return out
}

function physical(fetch: Fetch, index: number, grain: Node[], metrics: Node[], path: string[]): Physical {
  return { id: `${fetch.alias ?? ''}#${index}`, fetch, grain, metrics, ctes: [], path }
}

function walk(fetch: Fetch, nodes: Node[], grain: Node[], path: string[], out: Physical[]): void {
  const metrics = nodes.filter((n) => n.kind === 'metric')
  const dims = nodes.filter((n) => n.kind === 'dimension')
  if (metrics.length > 0 || dims.length === 0) out.push(physical(fetch, out.length, grain, metrics, path))
  for (const dim of dims) walk(fetch, dim.children, [...grain, dim], [...path, dim.alias], out)
}

function flatten(nodes: Node[], grain: Node[], metrics: Node[]): void {
  for (const n of nodes) {
    if (n.kind === 'metric') metrics.push(n)
    else {
      grain.push(n)
      flatten(n.children, grain, metrics)
    }
  }
}

/** `with` aliases a fetch depends on, transitively, in dependency order. */
export function dependencies(fetch: Fetch, plan: Plan, withAliases: Set<string>): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  const visiting = new Set<string>()
  const byAlias = new Map(plan.fetches.filter((f) => f.kind === 'with' && f.alias).map((f) => [f.alias as string, f]))

  const visit = (f: Fetch, from: string) => {
    const refs = [...(Array.isArray(f.source) ? f.source : [f.source]), ...f.joins.map((j) => j.table)]
    for (const ref of refs) {
      if (!withAliases.has(ref)) continue
      if (seen.has(ref)) continue
      if (visiting.has(ref)) throw new GritqlError('PLAN', `Circular with dependency: ${from} → ${ref}`, { path: [from] })
      visiting.add(ref)
      visit(byAlias.get(ref)!, ref)
      visiting.delete(ref)
      seen.add(ref)
      order.push(ref)
    }
  }
  visit(fetch, fetch.alias ?? fetch.kind)
  return order
}
