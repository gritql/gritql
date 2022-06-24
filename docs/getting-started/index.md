# Getting started

## Setup

## Adding provider configuration

## Basic request

Any request must contain query &lt;name&gt; section

- **name** argument defines default table name for query

Inside of query section you can _fetch_ / _fetchPlain_ / _with_ (see _Complicated queries_ in order to use _with_) section
In order to run query on database you need to provide at least one _fetch_ or _fetchPlain_ section
Only them really executes on database

Each of this sections has different amount of steps:

- **fetch**: build query -> fetch -> merge / build structure
- **fetchPlain**: build query -> fetch
- **with**: build query

**Example:**

```
query table {
    fetch(gtin: "0142546562211") {
        title
        brand
    }
}
```

**Result:**

```
{
    "title": "Name",
    "brand": "BrandName"
}
```

**Example:**

```
query table {
    fetchPlain(gtin: "0142546562211") {
        title
        brand
    }
}
```

**Result:**

```
[
    {
        "title": "Name",
        "brand": "BrandName"
    }
]
```

## Aliases

Aliases are available on all levels excluding query level
Metric and dimension resolvers calls requires alias for metric/dimension

**Examples:**

```
query table {
    all: fetch(brand: "adidas") {
        category {
            price: groupByEach(each: 50, field: price, type: Array) {
                gtin(type: Array) {
                    name: unique(a:title)
                    pageviews: sum(a:pageviews)
                    id: gtin
                }
            }
        }
    }
}
```

## Joins

## Default arguments

### Fetch arguments

- **${name}_${operator} (Optional):** Basic filters (see Filters -> Basic filters)
- **table (Optional):** - Change default table for current fetch (usefull for reusing of with)
- **filers (Optional):** - Advanced filters (see Filters -> Advanced Filters)

### Dimension arguments

- **type (Optional):** - Define merge policy (Enum: Array|Map)
- **sort_asc (Optional):** - Field to sort ascending
- **sort_desc (Optional):** - Field to sort descending
- **limit (Optional):** - SQL Limit (not exact limit of elements in dimension)
- **offset (Optional):** - SQL Offset (not exact offset of elements in dimension)

### Metric arguments

- **type (Optional):** - Define merge policy (Enum: Array|Map)
- **sort (Optional):** - Sort type by current field/metric (Enum: asc|desc)
- **limit (Optional):** - SQL Limit (not exact limit of elements returned by metric)
- **offset (Optional):** - SQL Offset (not exact offset of elements returned by metric)

## Clonning request

Request clonning is automatic feature
fetch / fetchPlain will automatically define amount of requests which is need to satisfy needs of your request / structure

**Example:**

This example will run just 2 queries, because needs of request can be satisfied in 2 requests

One for counts and second for pageviews aggregation

```
query table {
    brand {
        category {
            gtin {
                pageviews: sum(a:pageviews)
            }
        }
    }
    brandAmount: countDistinct(a:brand)
    categoryAmount: countDistinct(a:category)
    productsAmount: countDistinct(a:gtin)
}
```

**Example:**

This example will run 4 queries, one for each count and one for pageviews aggregation

So on each level where we create dimension and add additional metrics or dimensions on same level will be created additional request

```
query table {
    brand {
        category {
            gtin {
                pageviews: sum(a:pageviews)
            }
            categoryAmount: count()
        }
        brandAmount: count()
    }
    productsAmount: countDistinct(a:gtin)
}
```

## Complicated queries

## Fragments

## Variables
