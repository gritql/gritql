import { expect } from 'vitest'
import { fixtureAdapter, gritql, Gritql, Extension, Row } from '../src'

/** engine answering statements from fixed row sets, one per physical query in execution order */
export function engine(tables: Row[][] = [], ext?: Extension): Gritql {
  const g = gritql({ adapters: { pg: fixtureAdapter(tables) } })
  if (ext) g.use(ext)
  return g
}

export const run = (tables: Row[][], query: string, variables: Record<string, unknown> = {}, ext?: Extension) =>
  engine(tables, ext).run(query, variables)

/** inlined SQL text of every statement */
export async function sqlOf(query: string, variables: Record<string, unknown> = {}, ext?: Extension): Promise<string[]> {
  const compiled = await engine([], ext).compile(query, variables)
  return compiled.queries.map((q) => q.text)
}

export const snapshotSql = async (query: string, variables: Record<string, unknown> = {}) => {
  expect(await sqlOf(query, variables)).toMatchSnapshot()
}
