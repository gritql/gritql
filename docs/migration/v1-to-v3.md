# Migration from v1 to v3

## Mutations to directives

Mutations was slower by design and not so extendable, so they are replaced by directives

### @omit instead of mutation.blank

Omit has same behavior as blank (produces blank object instead of fetched data, fetched data will be available only it other directives)

### @diff instead of mutation.diff

@diff directive can be applied on metric/field level
It's more obvious and elegant by design
Also, your diff data will be available in the same object with every other piece of data

#### V1

```
query ecom_benchmarking {
      series: fetch(category:"Adult", country:"US") {
        channels {
            value: sum(a: sessions)
        }

      }
      prevSeries: fetch(category:"Adult", country:"US") {
              channels {
                  value: sum(a: sessions)
              }
      }

}
mutation {
      series: diff (of: series, by: prevSeries){
        channels {
          value
        }
      }
      prevSeries: blank {
        channels {
          value
        }
      }
}
```

#### V3

```
query ecom_benchmarking {
      series: fetch(category:"Adult", country:"US") {
        channels {
            value: sum(a: sessions) @diff(by: prevSeries)
        }

      }
      prevSeries: fetch(category:"Adult", country:"US") @omit {
              channels {
                  value: sum(a: sessions)
              }
      }

}
```

### @filter instead of mutation.pick

@filter directive covers value filtering part of pick mutation
@pick directive to filter one data set by another are comming soon

#### V1

```
query ecom_benchmarking {
      topChannels: fetch(category:"Adult", country:"DE") {
          channels (type: Array, sort_desc: value) {
              value: share(a: sessions)
        }
      }
      series: fetch(category:"Adult", country:"US") {
          date (type: Array, sort_asc: date) {
              channels {
                  value: share(a: transactions, by: date)
              }
          }
      }
    }
    mutation {
      series: pick(from: series, by: topChannels){
        channels(value_gt: 0.2)
      }
    }
```

#### V3

```
query ecom_benchmarking {
      topChannels: fetch(category:"Adult", country:"DE") {
          channels (type: Array, sort_desc: value) {
              value: share(a: sessions)
        }
      }
      series: fetch(category:"Adult", country:"US") {
          date (type: Array, sort_asc: date) {
              channels @filter(value_gt: 0.2) {
                  value: share(a: transactions, by: date)
              }
          }
      }
}
```

## Dimension resolvers (functions) instead of argument based adjustments

For easier parsing purpose and to have clear syntax argument based adjustments like groupBy and groupByEach has been moved to
separate functions as dimension resolvers

### GroupByEach

#### V1

```
query ecom_benchmarking {
        fetch(category:"Travel_and_Tourism", country:"US", date_gt:"2020-10-13", date_lt:"2021-04-13") {
            price(groupByEach: 50, type: Array, sort_asc: share) {
                share: share(a: sessions)
            }
        }
}
```

#### V3

```
query ecom_benchmarking {
        fetch(category:"Travel_and_Tourism", country:"US", date_gt:"2020-10-13", date_lt:"2021-04-13") {
            price: groupByEach(field: price, type: Array, sort_asc: share, each: 50) {
                share: share(a: sessions)
            }
        }
}
```

### GroupBy

#### V1

```
query table {
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(groupBy: month, type: Array){
            no_unique_products: sum(a:no_unique_products)
            no_brand_products: sum(a:no_brand_products)
          }
        }
      }
    }
```

#### V3

```
query table {
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date: groupBy(field: date, type: Array, by: month){
            no_unique_products: sum(a:no_unique_products)
            no_brand_products: sum(a:no_brand_products)
          }
        }
      }
}
```
