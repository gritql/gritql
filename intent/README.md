# SQL Intent Library - Ultra Minimal

A Knex.js-compatible query builder with intent recording in just **~45 lines of code**.

## Installation

```bash
npm install knex sql-intent
```

## Usage

```typescript
import { query } from 'sql-intent';
import knex from 'knex';

const db = knex({ client: 'postgresql', connection: {...} });

// Build queries with full Knex API
const userQuery = query()
  .select('id', 'name', 'email').name('fields')
  .from('users')
  .where('active', true).name('activeFilter')
  .orderBy('created_at', 'desc')
  .limit(10);

// Inspect steps
console.log(userQuery.getSteps());

// Group related steps
const groupedQuery = query()
  .select('id', 'name')
  .startGroup()
    .from('users')
    .where('active', true)
    .where('age', '>', 18)
  .endGroup().name('userFilters')
  .orderBy('name');

// Manipulate steps and groups
const modified = userQuery
  .remove('activeFilter')      // Remove by name
  .remove(3);                  // Remove by index

const withoutFilters = groupedQuery
  .remove('userFilters');      // Remove entire group

// Execute with Knex
const sql = modified.toSQL(db);
const results = await modified.execute(db);
```

## API

- **All Knex methods** - Automatically supported via Proxy
- `name(string)` - Name the previous step or group
- `getSteps()` - Get all recorded steps
- `remove(id)` - Remove step by index or name
- `startGroup()` - Begin grouping subsequent steps
- `endGroup()` - End current group (creates a group step)
- `toKnex(knex)` - Convert to Knex QueryBuilder
- `toSQL(knex)` - Generate SQL string
- `execute(knex)` - Execute query

## Grouping

Group related steps together for easier manipulation:

```typescript
const query = query()
  .select('id')
  .startGroup()
    .from('users')
    .where('active', true)
    .where('role', 'admin')
  .endGroup().name('adminFilters')
  .orderBy('name');

// Remove entire group at once
const simplified = query.remove('adminFilters');
```

## Implementation

The entire library in ~45 lines with grouping:

```typescript
type Step = { type: string; args: any[]; name?: string };

export const createQueryBuilder = (steps: Step[] = []) => {
  const proxy: any = new Proxy({}, {
    get(_, prop: string) {
      switch(prop) {
        case 'getSteps': return () => [...steps];
        case 'toKnex': return (knex: Knex) => {
          let qb = knex.queryBuilder();
          steps.forEach(s => (qb as any)[s.type]?.(...s.args));
          return qb;
        };
        case 'toSQL': return (knex: Knex) => proxy.toKnex(knex).toQuery();
        case 'execute': return (knex: Knex) => proxy.toKnex(knex);
        case 'remove': return (id: number | string) => createQueryBuilder(
          steps.filter((_, i) => typeof id === 'number' ? i !== id : _.name !== id)
        );
        case 'name': return (n: string) => {
          if (steps.length) steps[steps.length - 1].name = n;
          return createQueryBuilder([...steps]);
        };
        default: return (...args: any[]) => createQueryBuilder([
          ...steps, 
          { type: prop, args }
        ]);
      }
    }
  });
  return proxy;
};

export const query = () => createQueryBuilder();
```

## Why So Small?

- **Proxy intercepts all method calls** - No need to define each Knex method
- **Knex does the heavy lifting** - We just record and replay method calls
- **Future-proof** - New Knex methods work automatically

## License

MIT