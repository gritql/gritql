# gql like JSON slicer

Usage:
```javascript
const gqlSlice = require('gql-json-slicer');


const data = {
  user: {
    id: 1000,
    logo: "JohnLogo.jpg",
    name: "John Smith",
    projects: [
      {
        name: "Star Wars",
        type: "Movie"
      },
      {
        name: "Wookie",
        type: "Character"
      }
    ]
  }

}

gqlSlice(`{
  user {
    name
    projects {
      name
    }
  }
}`, data);

/* result:
{
  user: {
    name: "John Smith",
    projects: [
      {name: "Star Wars"},
      {name: "Wookie"}
    ]
  }
}
*/
```

