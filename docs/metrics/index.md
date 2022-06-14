# Metrics

## Aggregation metrics

### Sum

Provide sum over field

- **Supported providers:** pg, snowflake
- **Arguments:**
- &emsp; **a (Required):** Field
- &emsp; **from (Optional):** Table (Useful on joins, when both tables has same field name)

**Example:**

```
query table {
    fetch {
        device {
            pageviews: sum(a:pageviews)
        }
    }
}
```

### Max

Provide max value of field

- **Supported providers:** pg, snowflake
- **Arguments:**
- &emsp; **a (Required):** Field
- &emsp; **from (Optional):** Table (Useful on joins, when both tables has same field name)

**Example:**

```
query table {
    fetch {
        device {
            maxPageviews: max(a:pageviews)
        }
    }
}
```

### Min

Provide min value of field

- **Supported providers:** pg, snowflake
- **Arguments:**
- &emsp; **a (Required):** Field
- &emsp; **from (Optional):** Table (Useful on joins, when both tables has same field name)

**Example:**

```
query table {
    fetch {
        device {
            minPageviews: min(a:pageviews)
        }
    }
}
```

### Count

Provide count of rows

- **Supported providers:** pg, snowflake
- **Arguments:**
- &emsp; **a (Optional):** Field
- &emsp; **from (Optional):** Table (Useful on joins, when both tables has same field name)

**Example:**

Count of rows for each device type

```
query table {
    fetch {
        device {
            count: count()
        }
    }
}
```

### CountDistinct

Provide count of unique (distinct) rows

- **Supported providers:** pg, snowflake
- **Arguments:**
- &emsp; **a (Required):** Field
- &emsp; **from (Optional):** Table (Useful on joins, when both tables has same field name)

**Example:**

Count of unique dates for each device type

```
query table {
    fetch {
        device {
            count: countDistinct(a:date)
        }
    }
}
```

### Divide

### Median

Calculate median for given field

- **Supported providers:** snowflake
- **Arguments:**
- &emsp; **a (Required):** Field
- &emsp; **by (Optional):** Field for partitioning (apply window function)
- &emsp; **from (Optional):** Table (Useful on joins, when both tables has same field name)

**Example:**

```
query table {
    fetch {
        device {
            medianPrice: median(a:price)
        }
    }
}
```

### Percentile

Calculate percentile for given field

- **Supported providers:** pg
- **Arguments:**
- &emsp; **a (Required):** Field
- &emsp; **factor (Default=0.5):** Percentage of calculated percentile
- &emsp; **from (Optional):** Table (Useful on joins, when both tables has same field name)

**Example:**

```
query table {
    fetch {
        device {
            medianPrice: percentile(a:price, factor:0.5)
        }
    }
}
```

### Avg

Calculate avarage value for given field

- **Supported providers:** pg, snowflake
- **Arguments:**
- &emsp; **a (Required):** Field
- &emsp; **by (Optional):** Field for partitioning (apply window function)
- &emsp; **from (Optional):** Table (Useful on joins, when both tables has same field name)

**Example:**

```
query table {
    fetch {
        device {
            avgPrice: avg(a:price)
        }
    }
}
```

### AggrAverage

### WeightAvg

### AvgPerDimension

### Share

Calculate share (percentage of total) for given field

- **Supported providers:** pg, snowflake
- **Arguments:**
- &emsp; **a (Required):** Field
- &emsp; **by (Optional):** Field for partitioning (apply window function)
- &emsp; **from (Optional):** Table (Useful on joins, when both tables has same field name)

**Example:**

```
query table {
    fetch {
        device {
            pageviews: share(a:pageviews)
        }
    }
}
```

### Indexed

Calculate indexed representation of value for given field

Formula: value / max(value)

- **Supported providers:** pg, snowflake
- **Arguments:**
- &emsp; **a (Required):** Field
- &emsp; **by (Optional):** Field for partitioning (apply window function)
- &emsp; **from (Optional):** Table (Useful on joins, when both tables has same field name)

**Example:**

```
query table {
    fetch {
        device {
            avgPrice: avg(a:price)
        }
    }
}
```

### Ranking

## Array metrics

### Distinct

## Getter metrics

### From

Provide table name from which we need to get field (Useful on joins, when both tables has same field name)

- **Supported providers:** pg, snowflake
- **Arguments:**
- &emsp; **a (Required):** Field
- &emsp; **from (Optional):** Table

**Example:**

```
query table {
    fetch {
        device {
            join(table: prices, by: "@gtin:@gtin") {
                price: from(a:price, from: prices)
            }
        }
    }
}
```

### Unique

Ensure that field can be fetched inside of dimension without aggregation
If database will return two rows - last row will be used
So this metric are very dangerous without ensuring that value fully unique within query

- **Supported providers:** pg, snowflake
- **Arguments:**
- &emsp; **a (Required):** Field
- &emsp; **from (Optional):** Table (Useful on joins, when both tables has same field name)

**Example:**

```
query table {
    fetch {
        gtin {
            price: unique(a:price)
        }
    }
}
```

## Search metrics

### SearchHeadline

### SearchRanking

## Join metrics

### Join

### LeftJoin

### RightJoin

### FullJoin

### InnerJoin

### LeftOuterJoin

### RightOuterJoin

### FullOuterJoin
