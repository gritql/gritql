# gql-sql-slicer | A query library for your SQL ddatabase.
The library is built to query simple dimension/metric based tables. It allows to fetch data in the form you want it.
### example
Query:
```
query customers{
  fetch(country: US){
    plan {
      revenue: sum(a: planPrice)
    }
  }
}
```
Response:
```
{
  free: {
    revenue: 0
  },
  small: {
    revenue: 9000
  },
  large: {
    revenue: 380
  },
  pro: {
    revenue: 500
  }
}
```
Table Schema:
Customer Name, plan, planPrice

## installation

## query table

## multiple queries

## fetch an Array
### sort
## dates
### group

## aggregation functions

### sum
### divide
### share

### distinct