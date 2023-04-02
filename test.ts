//write a function in typescript that would take an object as argument, path, and a value and will set the value in the object according to the path
//now add another parameter as an argument hashContext. It will be an object that will keep all path steps in tree like structure, each leaf would be a step of a path and will also contain reference to its parent in property $prevHashContext.
/*
function setValue(obj: any, path: string, value: any, hashContext: any = {}) {
  // convert the path to an array of keys
  const keys = path.split('.')

  // iterate over the keys and use them to drill down into the object
  let current = obj
  for (const key of keys) {
    // if the current value is an object, drill down into it and continue
    if (typeof current === 'object' && current !== null) {
      // if the current key is not already a property of the current value, create it
      if (!current.hasOwnProperty(key)) {
        current[key] = {}
      }

      current = current[key]

      // update the hashContext by adding a reference to the current key
      hashContext[key] = hashContext[key] || { $prevHashContext: hashContext }
      hashContext = hashContext[key]
      continue
    }

    // if the current value is not an object, throw an error
    throw new Error('Invalid path: the path leads to a non-object value')
  }

  // once we've drilled down to the correct location in the object, set the value
  current = value
}
*/
function setValueAtPath(
  obj: any,
  path: string,
  value: any,
  hashContext: any = {},
) {
  const pathElements = path.split('.')

  // Recursive function that sets the value at the specified path in `obj`
  // and updates `hashContext` as it goes.
  function setValue(currentObj: any, currentPathElements: string[]) {
    // If there are no more path elements, we have reached the correct
    // position in the object, so we set the value and return.
    if (currentPathElements.length === 0) {
      currentObj.value = value
      return obj
    }

    // Get the current path element and the rest of the path elements.
    const [currentPathElement, ...restPathElements] = currentPathElements

    // Create the property in the current object if it does not exist yet.
    currentObj[currentPathElement] = Object.assign(
      {},
      currentObj[currentPathElement],
    )

    // Update `hashContext` with the current path element.
    if (!hashContext[currentPathElement]) {
      hashContext[currentPathElement] = { $prevHashContext: hashContext }
    }
    hashContext = hashContext[currentPathElement]

    // Recursively set the value for the rest of the path elements.
    return setValue(currentObj[currentPathElement], restPathElements)
  }

  return setValue(obj, pathElements)
}

const obj = {}

const hashContext = {}
setValueAtPath(obj, 'foo.bar.baz', 'world', hashContext)

console.log(JSON.stringify(obj))
console.log(hashContext)
