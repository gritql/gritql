import type { Adapter, Extension, Resolver } from './model'

/** Holds every registered resolver and adapter. Later registrations replace earlier ones. */
export class Registry {
  metrics = new Map<string, Resolver>()
  dimensions = new Map<string, Resolver>()
  directives = new Map<string, Resolver>()
  middleware: Resolver[] = []
  adapters = new Map<string, Adapter>()

  use(ext: Extension): this {
    for (const [k, v] of Object.entries(ext.metrics ?? {})) this.metrics.set(k, v)
    for (const [k, v] of Object.entries(ext.dimensions ?? {})) this.dimensions.set(k, v)
    for (const [k, v] of Object.entries(ext.directives ?? {})) this.directives.set(k, v)
    for (const m of ext.middleware ?? []) this.middleware.push(m)
    for (const [k, v] of Object.entries(ext.adapters ?? {})) this.adapters.set(k, v)
    return this
  }

  metric(name: string): Resolver {
    return this.metrics.get(name) ?? this.metrics.get('default')!
  }

  dimension(name: string): Resolver {
    return this.dimensions.get(name) ?? this.dimensions.get('default')!
  }
}
