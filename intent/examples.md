# SQL Intent Library Examples

Build and manipulate SQL queries with full Knex compatibility in just 30 lines of code.

## Example 1: Basic Query with Step Modification

```typescript
import { query } from 'sql-intent';
import knex from 'knex';

// Initialize Knex
const db = knex({
  client: 'postgresql',
  connection: {
    host: 'localhost',
    user: 'username',
    password: 'password',
    database: 'mydb'
  }
});

// Build a basic query using intent recording
const userQuery = query()
  .select('id', 'name', 'email')
  .from('users')
  .where('active', true)
  .orderBy('name', 'asc')
  .limit(10);

// Inspect the steps
console.log('Original steps:', userQuery.getSteps());

// Modify the query by removing the limit and adding a different condition
const modifiedQuery = userQuery
  .removeStep(4) // Remove limit step
  .where('created_at', '>', '2023-01-01');

// Generate SQL using Knex compilation (recommended)
console.log('Modified SQL:', modifiedQuery.toSQL(db));
// Output: SELECT "id", "name", "email" FROM "users" WHERE "active" = true AND "created_at" > '2023-01-01' ORDER BY "name" ASC

// Execute the query
const results = await modifiedQuery.execute(db);
console.log('Query results:', results);

// Or get the Knex QueryBuilder for further manipulation
const knexQuery = modifiedQuery.toKnex(db);
console.log('Knex query:', knexQuery.toQuery());
```

## Example 2: Complex Join Query with Step Inspection

```typescript
import { query } from 'sql-intent';
import knex from 'knex';

const db = knex({ client: 'postgresql', connection: {...} });

// Build a complex query with joins - exact Knex API
const complexQuery = query()
  .select('u.name', 'p.title', 'c.name as category')
  .from('users as u')
  .leftJoin('posts as p', 'u.id', 'p.user_id')
  .innerJoin('categories as c', 'p.category_id', 'c.id')
  .where('u.active', true)
  .where('p.published', true)
  .groupBy('u.id', 'p.id')
  .having('count', '>', 0)
  .orderBy('u.name');

// Inspect all steps
const steps = complexQuery.getSteps();
console.log('Query has', steps.length, 'steps:');
steps.forEach((step, index) => {
  console.log(`${index}: ${step.type} - ${JSON.stringify(step.args)}`);
});

// Replace a step - change the left join to an inner join
const updatedQuery = complexQuery.replaceStep(2, 'innerJoin', 'posts as p', 'u.id', 'p.user_id');

// Generate SQL with Knex - produces production-ready SQL with proper escaping
console.log('Updated SQL:', updatedQuery.toSQL(db));
// Output: SELECT "u"."name", "p"."title", "c"."name" as "category" FROM "users" as "u" INNER JOIN "posts" as "p" ON "u"."id" = "p"."user_id" INNER JOIN "categories" as "c" ON "p"."category_id" = "c"."id" WHERE "u"."active" = true AND "p"."published" = true GROUP BY "u"."id", "p"."id" HAVING "count" > 0 ORDER BY "u"."name" ASC

// Execute the complex query
const results = await updatedQuery.execute(db);
```

## Example 3: Dynamic Query Building with Conditional Steps

```typescript
import { query } from 'sql-intent';
import knex from 'knex';

const db = knex({ client: 'mysql2', connection: {...} });

// Start with a base query
let productQuery = query()
  .select('*')
  .from('products');

// Conditionally add filters based on user input
const filters = {
  category: 'electronics',
  minPrice: 100,
  maxPrice: 500,
  inStock: true
};

// Add filters dynamically - exactly like Knex
if (filters.category) {
  productQuery = productQuery.where('category', filters.category);
}

if (filters.minPrice) {
  productQuery = productQuery.where('price', '>=', filters.minPrice);
}

if (filters.maxPrice) {
  productQuery = productQuery.where('price', '<=', filters.maxPrice);
}

if (filters.inStock) {
  productQuery = productQuery.where('stock_quantity', '>', 0);
}

// Add sorting
productQuery = productQuery.orderBy('price', 'asc');

// Clone the query for different variations
const expensiveFirst = productQuery.clone()
  .removeStep(productQuery.getSteps().length - 1) // Remove current order
  .orderBy('price', 'desc');

const alphabetical = productQuery.clone()
  .removeStep(productQuery.getSteps().length - 1) // Remove current order
  .orderBy('name', 'asc');

// Generate different SQL variations using Knex
console.log('Price ascending:', productQuery.toSQL(db));
console.log('Price descending:', expensiveFirst.toSQL(db));
console.log('Alphabetical:', alphabetical.toSQL(db));

// Execute different variations
const cheapProducts = await productQuery.execute(db);
const expensiveProducts = await expensiveFirst.execute(db);

// Inspect final steps
console.log('Final query steps:');
productQuery.getSteps().forEach((step, i) => {
  console.log(`${i}: ${step.type}(${step.args.join(', ')})`);
});

// Convert to Knex for additional manipulation if needed
const knexQuery = productQuery.toKnex(db);
const finalQuery = knexQuery.where('created_at', '>', '2023-01-01');
```

## Advanced Usage: Step Manipulation & Knex Integration

```typescript
import { query, Intent, SelectBuilder } from 'sql-intent';
import knex from 'knex';

const db = knex({ client: 'sqlite3', connection: { filename: ':memory:' } });

// Create a query with intent recording
const baseQuery = query()
  .select('id', 'name')
  .from('users')
  .where('age', '>', 18)
  .where('status', 'active')
  .orderBy('created_at', 'desc')
  .limit(20);

// Get specific steps by type
const whereSteps = baseQuery.getIntent().getStepsByType('where');
console.log('WHERE conditions:', whereSteps);

// Insert a step in the middle
const withExtraFilter = baseQuery.insertStep(3, 'where', 'country', 'US');

// Remove multiple steps and rebuild
const simplified = baseQuery
  .removeStep(3) // Remove second where
  .removeStep(3) // Remove order by (index shifts after removal)
  .limit(50);    // Change limit

// Generate SQL using Knex compilation for production use
console.log('Simplified query:', simplified.toSQL(db));
// Output: SELECT `id`, `name` FROM `users` WHERE `age` > 18 LIMIT 50

// Execute with Knex
const results = await simplified.execute(db);

// Serialize and deserialize intent for storage/transmission
const serialized = baseQuery.getIntent().serialize();
const restored = Intent.deserialize(serialized);
const restoredQuery = new SelectBuilder(restored);

console.log('Restored query SQL:', restoredQuery.toSQL(db));

// Advanced: Convert to raw Knex for complex operations
const knexQuery = baseQuery.toKnex(db);
const complexQuery = knexQuery
  .leftJoin('profiles', 'users.id', 'profiles.user_id')
  .select('profiles.avatar_url')
  .whereRaw('users.created_at > NOW() - INTERVAL 30 DAY');

console.log('Complex Knex query:', complexQuery.toQuery());

// Perfect 1:1 API compatibility with Knex
const traditionalKnex = db('users').select('*').where('active', true);
const intentQuery = query().from('users').select('*').where('active', true);

console.log('Traditional Knex:', traditionalKnex.toQuery());
console.log('Intent Query:', intentQuery.toSQL(db));
// Both produce identical SQL!
```

## Why This Library?

- **Ultra-minimal**: Just 30 lines of code
- **Full Knex compatibility**: Every Knex method works automatically
- **Intent recording**: Inspect and manipulate query steps
- **Future-proof**: New Knex methods work without updates

## More Examples

### Complex Queries

```typescript
// All Knex methods work automatically
const complexQuery = query()
  .with('recent_orders', db.raw('SELECT * FROM orders WHERE created_at > ?', ['2023-01-01']))
  .select('users.*', 'order_counts.total')
  .from('users')
  .leftJoin(
    db.raw('(SELECT user_id, COUNT(*) as total FROM recent_orders GROUP BY user_id) as order_counts'),
    'users.id',
    'order_counts.user_id'
  )
  .whereExists(function() {
    this.select('*').from('user_roles').where('user_id', 'users.id');
  })
  .orderByRaw('order_counts.total DESC NULLS LAST');
```

### Step Inspection

```typescript
const steps = complexQuery.getSteps();
console.log(`Query has ${steps.length} steps:`);
steps.forEach((step, i) => {
  console.log(`${i}: ${step.type}(${JSON.stringify(step.args).slice(0, 50)}...)`);
});
```