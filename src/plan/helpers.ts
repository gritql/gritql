/**
 * Plan-stage helpers (SPEC §3). Plan objects are plain data; these are the
 * functions directives and middleware use to read and edit them.
 */
import type { Fetch, Node, Plan } from '../model'

/** first fetch with that alias; `null` finds the first unaliased fetch */
export function fetchOf(plan: Plan, alias: string | null): Fetch | undefined {
  return plan.fetches.find((f) => f.alias === alias)
}

/** node by output-key path inside a fetch, e.g. ['date', 'value'] */
export function nodeAt(fetch: Fetch, path: string[]): Node | undefined {
  let nodes = fetch.tree
  let found: Node | undefined
  for (const key of path) {
    found = nodes.find((n) => n.alias === key)
    if (!found) return undefined
    nodes = found.children
  }
  return found
}

/** insert `node` under the dimension named by `path`; missing dimensions are created as default dimensions */
export function insertNode(fetch: Fetch, path: string[], node: Node): void {
  let nodes = fetch.tree
  for (const key of path) {
    let dim = nodes.find((n) => n.alias === key)
    if (!dim) {
      dim = { alias: key, name: key, kind: 'dimension', args: {}, children: [], directives: [], emit: true }
      nodes.push(dim)
    }
    nodes = dim.children
  }
  nodes.push(node)
}

/** deep copy with fresh (empty) directive state */
export function cloneNode(node: Node): Node {
  return {
    ...node,
    args: { ...node.args },
    children: node.children.map(cloneNode),
    directives: node.directives.map((d) => ({ name: d.name, args: { ...d.args }, state: {} })),
  }
}

/** output-key path of every node in a fetch, pre-order */
export function* walkNodes(nodes: Node[], path: string[] = []): Generator<{ node: Node; path: string[] }> {
  for (const node of nodes) {
    const p = [...path, node.alias]
    yield { node, path: p }
    if (node.children.length) yield* walkNodes(node.children, p)
  }
}
