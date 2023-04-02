function unshieldSeparator(str) {
  if (typeof str !== 'string') return str
  return str.replace(/\$#@#/g, '.')
}

function getIndex(steps: [string, string][], values?: any) {
  const indexStep = steps.map(([step]) => `$${step}`).join(';')
  const indexValue = steps
    .map(([step, value]) => (values ? values[step] ?? value : value))
    .join(';')

  return { indexStep, indexValue }
}

// var k = {}
// var hashContext: any = {}
// progressiveSet(k, 'book.test.one', 1, false, hashContext)
// progressiveSet(k, 'book.two.one', 3, false, hashContext)
// progressiveSet(k, 'book.dumbo.[].one', 3, false, hashContext)
// progressiveSet(k, 'book.dumbo.[].twenty', 434, false, hashContext)
// progressiveSet(k, 'book.dumbo.[].second', '3dqd25', false, hashContext)
// progressiveSet(k, 'book.dumbo.[1].leela', 'fry', false, hashContext)
// progressiveSet(k, 'book.dumbo.[@one=3].leela', 'fry', false, hashContext)
// console.log(JSON.stringify(k), hashContext)

export function progressiveGet(object, queryPath, hashContext = {}) {
  const pathArray = queryPath.split(/\./).map((p) => unshieldSeparator(p))
  return pathArray.reduce((r, pathStep, i) => {
    if (pathStep.startsWith('[') && pathStep.endsWith(']')) {
      const path = pathStep.slice(0, -1).slice(2)

      const steps = path.split(';').map((path) => {
        const separatorIndex = path.indexOf('=')

        const [step, value] = [
          path.slice(0, separatorIndex),
          path.slice(separatorIndex + 1),
        ]

        return [step, value]
      })

      const { indexStep, indexValue } = getIndex(steps)

      if (Array.isArray(r)) {
        // Fast indexing
        let index = hashContext?.[indexStep]?.[indexValue]?.index
        if (index != null) {
          hashContext = hashContext[indexStep][indexValue]
          return r[index]
        }

        index = r.findIndex((o) =>
          steps.every(([step, value]) => o[step] == value),
        )

        if (index !== -1) {
          hashContext[indexStep] = hashContext[indexStep] || {
            $prevHashContext: hashContext,
          }
          hashContext[indexStep][indexValue] = {
            $prevHashContext: hashContext[indexStep],
            ...hashContext[indexStep][indexValue],
            index,
          }
          hashContext = hashContext[indexStep][indexValue]

          return r[index]
        } else {
          return NaN
        }
      } else if (steps.length === 1 && Array.isArray(r[steps[0][0]])) {
        const [step, value] = steps[0]

        // Fast indexing
        let index = hashContext?.[indexStep]?.[indexValue]?.index
        if (index != null) {
          hashContext = hashContext[indexStep]
          return r[step][index]
        }

        index = r[step].findIndex((o) => o[step] == value)

        if (index !== -1) {
          hashContext[indexStep] = hashContext[indexStep] || {
            $prevHashContext: hashContext,
          }
          hashContext[indexStep][indexValue] = {
            $prevHashContext: hashContext[indexStep],
            ...hashContext[indexStep][indexValue],
            index,
          }

          hashContext = hashContext[indexStep][indexValue]

          return r[step][index]
        } else {
          return NaN
        }
      } else if (r[pathStep]) {
        hashContext[`$${pathStep}`] = hashContext[`$${pathStep}`] || {
          $prevHashContext: hashContext,
        }
        hashContext = hashContext[`$${pathStep}`]
        return r[pathStep]
      } else {
        return NaN
      }
    }

    if (Array.isArray(r)) {
      return r.find((o) => Object.values(o).includes(pathStep))
    }
    if (r == undefined) return NaN
    hashContext[`$${pathStep}`] = hashContext[`$${pathStep}`] || {
      $prevHashContext: hashContext,
    }
    hashContext = hashContext[`$${pathStep}`]
    return r[pathStep]
  }, object)
}

export function progressiveSet(
  object,
  queryPath,
  value,
  summItUp,
  hashContext: Record<string, any> = {},
) {
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

      if (key.includes(';')) {
        leaf = []
      } else {
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

        const steps = key.split(';').map((key) => key.split('='))

        namedArrayIndex = steps
        const { indexValue, indexStep } = getIndex(steps)

        // Fast indexing
        const firstIndexInput = !hashContext[indexStep]
        hashContext[indexStep] = hashContext[indexStep] || {
          $prevHashContext: hashContext,
        }
        let found
        const index = hashContext[indexStep]?.[indexValue]?.index

        if (index != null) {
          found = leaf[index] ?? null
        }

        if (found == null && firstIndexInput) {
          const foundIndex = leaf.findIndex((a) =>
            steps.every(([step, value]) => a[step] == '' + value),
          )

          if (foundIndex !== -1) {
            hashContext[indexStep][indexValue] = {
              $prevHashContext: hashContext[indexStep],
              ...hashContext[indexStep][indexValue],
              index: foundIndex,
            }
            found = leaf[foundIndex]
          }
        }

        if (!!found) {
          leaf = found
          hashContext = hashContext[indexStep][indexValue]
        } else {
          let obj = {}

          steps.forEach(([step, value]) => {
            obj[step] = value
          })

          leaf.push(obj)
          hashContext[indexStep][indexValue] = {
            $prevHashContext: hashContext[indexStep],
            ...hashContext[indexStep][indexValue],
            index: leaf.length - 1,
          }
          hashContext = hashContext[indexStep][indexValue]
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

      hashContext[`${pathStep}`] = hashContext[`${pathStep}`] || {
        $prevHashContext: hashContext,
      }
      hashContext = hashContext[`${pathStep}`]

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

    pathHistory.forEach(({ leaf: step, namedArrayIndex }) => {
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
                    !previousStepNameddArrayIndex.find(
                      ([step]) => step === vk,
                    )?.[1] == val[vk]))
              )
            }, false)
          )
            return true
        })
        if (!!~spliceIndex) {
          const { indexStep, indexValue } = getIndex(
            namedArrayIndex,
            step[spliceIndex],
          )

          delete hashContext[indexStep][indexValue]
          step.splice(spliceIndex, 1)
        }
      } else {
        const spliceKey = Object.keys(step).find((val, i) => {
          if (!step[val]) return false
          if (
            namedArrayIndex &&
            namedArrayIndex.find(([step]) => step == val)?.[1] === step[val]
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

        if (!!spliceKey) {
          if (hashContext.$prevHashContext[spliceKey] === hashContext) {
            delete hashContext.$prevHashContext[spliceKey]
          }
          delete step[spliceKey]
        }
      }

      if (hashContext.$prevHashContext) {
        hashContext = hashContext.$prevHashContext
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
      obj.forEach?.((el, i) => {
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

function shieldSeparator(str) {
  if (typeof str !== 'string') return str
  return str.replace(/\./g, '$#@#')
}

export function replVars(str, obj) {
  const keys = Object.keys(obj)
  for (var key in keys) {
    str = str.replace(`:${keys[key]}`, shieldSeparator(obj[keys[key]]))
  }
  return str
}

export function getBatchContext(batches, by) {
  return (
    (batches[by] || batches['___query' + by])?.find((q) => q.name === by)
      ?.hashContext || {}
  )
}
