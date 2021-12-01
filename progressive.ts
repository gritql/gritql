function unshieldSeparator(str) {
  if (typeof str !== 'string') return str
  return str.replace(/\$#@#/, '.')
}

/*
var k = {};
progressiveSet(k, 'book.test.one', 1)
progressiveSet(k, 'book.two.one', 3)
progressiveSet(k, 'book.dumbo.[].one', 3)
progressiveSet(k, 'book.dumbo.[].twenty', 434)
progressiveSet(k, 'book.dumbo.[].second', '3dqd25')
progressiveSet(k, 'book.dumbo.[1].leela', 'fry')
progressiveSet(k, 'book.dumbo.[@one=3].leela', 'fry')
console.log(JSON.stringify(k))
*/
export function progressiveGet(object, queryPath) {
  const pathArray = queryPath.split(/\./).map((p) => unshieldSeparator(p))
  return pathArray.reduce((r, pathStep, i) => {
    if (Array.isArray(r)) {
      return r.find((o) => Object.values(o).includes(pathStep))
    }
    if (!r) return NaN
    return r[pathStep]
  }, object)
}

export function progressiveSet(object, queryPath, value, summItUp) {
  const pathArray = queryPath.split(/\./).map((p) => unshieldSeparator(p))
  const property = pathArray.splice(-1)
  if (
    queryPath.startsWith('[') &&
    !Array.isArray(object) &&
    Object.keys(object).length === 0
  )
    object = []
  let leaf = object
  let pathHistory = [{ leaf, namedArrayIndex: null }]
  pathArray.forEach((pathStep, i) => {
    let namedArrayIndex = null
    if (pathStep.startsWith('[') && !Array.isArray(leaf)) {
      let key = pathStep.slice(1, pathStep.length - 1)

      if ((key !== 0 && !key) || Number.isInteger(+key)) {
        leaf['arr'] = []
        leaf = leaf['arr']
      } else if (key.startsWith('@')) {
        key = key.slice(1)
        const filterBy = key.split('=')

        if (!leaf[filterBy[0]]) leaf[filterBy[0]] = []
        leaf = leaf[filterBy[0]]
      }
    }
    if (Array.isArray(leaf)) {
      let key = pathStep.slice(1, pathStep.length - 1)
      if (key !== 0 && !key) {
        leaf.push({})
        leaf = leaf[leaf.length - 1]
      } else if (Number.isInteger(+key)) {
        leaf = leaf[+key]
      } else if (key.startsWith('@')) {
        key = key.slice(1)

        const filterBy = key.split('=')
        namedArrayIndex = filterBy
        const found = leaf.find((a) => a[filterBy[0]] == '' + filterBy[1])
        if (!!found) {
          leaf = found
        } else {
          leaf.push({ [filterBy[0]]: filterBy[1] })
          leaf = leaf[leaf.length - 1]
        }
      }
    } else {
      const nextStep = pathArray[i + 1]
      if (
        !!nextStep &&
        nextStep.startsWith('[') &&
        nextStep.endsWith(']') &&
        !leaf[pathStep]
      ) {
        leaf[pathStep] = []
      }
      if (!leaf[pathStep]) leaf[pathStep] = {} //todo guess if there should be an array
      leaf = leaf[pathStep]
    }
    pathHistory = pathHistory.concat([{ leaf, namedArrayIndex }])
  })

  if (summItUp && !!leaf[property]) {
    leaf[property] += value
  } else {
    leaf[property] = value
  }

  if (value === undefined) {
    pathHistory.reverse()

    pathHistory.forEach(({ leaf: step, namedArrayIndex }, i) => {
      if (Array.isArray(step)) {
        const spliceIndex = Object.values(step).findIndex((val, i) => {
          const previousStepNameddArrayIndex =
            pathHistory[i - 1] && pathHistory[i - 1].namedArrayIndex
          if (
            Array.isArray(val) &&
            !val.reduce((r, v) => r || v !== undefined, false)
          )
            return true
          if (
            !Object.keys(val).reduce((r, vk) => {
              return (
                r ||
                (val[vk] !== undefined &&
                  (!previousStepNameddArrayIndex ||
                    !(
                      previousStepNameddArrayIndex[0] === vk &&
                      previousStepNameddArrayIndex[1] == val[vk]
                    )))
              )
            }, false)
          )
            return true
        })
        if (!!~spliceIndex) step.splice(spliceIndex, 1)
      } else {
        const spliceKey = Object.keys(step).find((val, i) => {
          if (!step[val]) return false
          if (
            namedArrayIndex &&
            val == namedArrayIndex[0] &&
            step[val] == namedArrayIndex[1]
          )
            return true
          if (
            Array.isArray(step[val]) &&
            !step[val].reduce((r, v) => r || v !== undefined, false)
          )
            return true
          if (
            !Object.values(step[val]).reduce(
              (r, v) => r || v !== undefined,
              false,
            )
          )
            return true
        })
        if (!!spliceKey) delete step[spliceKey]
      }
    })
  }
  return object
}

export function iterateProgressive(
  obj,
  key: string,
  callback: (obj, currentKeys: Array<number | string>) => void,
) {
  function iterateKeys(obj, keys: string[], index = 0, currentKeys = []) {
    if (index === keys.length || obj == null) {
      callback(obj, currentKeys)
      return
    }



    if (keys[index].startsWith(':')) {
      const objKeys = Object.keys(obj)

      objKeys.forEach((key) => {
        iterateKeys(obj[key], keys, index + 1, [...currentKeys, key])
      })
    } else if (keys[index].startsWith('[') && keys[index].endsWith(']')) {
      obj.forEach((el, i) => {
        iterateKeys(el, keys, index + 1, [...currentKeys, i])
      })
    } else {
      iterateKeys(obj[keys[index]], keys, index + 1, [
        ...currentKeys,
        keys[index],
      ])
    }
  }

  return iterateKeys(obj, key.split('.'))
}
