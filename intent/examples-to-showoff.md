# SQL Intent Library - 60 Lines, Maximum Power

Ultra-minimal examples showing maximum functionality in just 60 lines of code.

## 🎯 Complete Feature Demo

```typescript
import { query } from 'sql-intent';
import knex from 'knex';

const db = knex({ client: 'postgresql', connection: {...} });

// Build complex query with intent recording + grouping
const userQuery = query()
  .select('users.id', 'users.name').name('fields')
  .startGroup()
    .from('users')
    .leftJoin('profiles', 'users.id', 'profiles.user_id')
    .where('users.active', true)
    .where('profiles.verified', true)
  .endGroup().name('userFilters')
  .orderBy('users.created_at', 'desc')
  .limit(50);

// Inspect what we built
console.log('Steps:', userQuery.getSteps().length); // 4 steps

// Manipulate by removing entire groups
const simplified = userQuery.remove('userFilters');
console.log('Simplified:', simplified.getSteps().length); // 3 steps

// Or remove individual named steps
const noLimit = userQuery.remove('fields').select('COUNT(*) as total');

// Dynamic conditional building
let productQuery = query().select('*').from('products');
const filters = { category: 'electronics', minPrice: 100, inStock: true };

if (filters.category) {
  productQuery = productQuery.where('category', filters.category).name('categoryFilter');
}
if (filters.minPrice) {
  productQuery = productQuery.where('price', '>=', filters.minPrice).name('priceFilter');
}
if (filters.inStock) {
  productQuery = productQuery.where('stock', '>', 0).name('stockFilter');
}

// Create variations by removing different filters
const expensiveOnly = productQuery.remove('categoryFilter').remove('stockFilter');
const inStockOnly = productQuery.remove('categoryFilter').remove('priceFilter');

// Execute with full Knex compatibility - every method works via Proxy
const advancedQuery = query()
  .with('recent_orders', 'SELECT * FROM orders WHERE created_at > NOW() - INTERVAL 7 DAY')
  .select('users.name', 'order_stats.total')
  .from('users')
  .leftJoin(db.raw('(SELECT user_id, COUNT(*) as total FROM recent_orders GROUP BY user_id) as order_stats'), 'users.id', 'order_stats.user_id')
  .whereExists(function() { this.select('*').from('user_roles').where('user_id', 'users.id'); })
  .orderByRaw('order_stats.total DESC NULLS LAST')
  .window('row_num', 'PARTITION BY department ORDER BY salary DESC')
  .limit(100);

// Convert to SQL and execute
const sql = advancedQuery.toSQL(db);
const results = await advancedQuery.execute(db);

// Real-world: Query Builder Factory
class QueryFactory {
  static activeUsers() {
    return query()
      .select('users.id', 'users.name', 'users.email')
      .from('users')
      .where('users.active', true)
      .where('users.deleted_at', null);
  }
  
  static withProfile() {
    return this.activeUsers()
      .startGroup()
        .leftJoin('profiles', 'users.id', 'profiles.user_id')
        .select('profiles.avatar', 'profiles.bio')
      .endGroup().name('profileData');
  }
}

const fullQuery = QueryFactory.withProfile().orderBy('users.name').limit(20);
const basicQuery = fullQuery.remove('profileData'); // No profile data needed

console.log('60 lines = Full Knex API + Intent + Grouping + Manipulation + Type Safety');
```

## Why This is Revolutionary

- **60 lines** = Complete Knex compatibility + intent recording + grouping + manipulation
- **Zero config** - Works with any existing Knex setup immediately
- **Future-proof** - New Knex methods automatically work without library updates
- **Type-safe** - Full TypeScript support with Knex type inference
- **Immutable** - Functional programming friendly, every operation returns new instance
- **Inspectable** - See exactly what your query will do before execution
- **Manipulable** - Add, remove, replace any part of the query dynamically
- **Groupable** - Bundle related operations, manipulate as single units

Perfect for: Dynamic query building, conditional filters, query templates, A/B testing different query variations, debugging complex queries, and any scenario where you need to inspect or modify queries before execution.