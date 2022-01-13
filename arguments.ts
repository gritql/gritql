export function argumentsToObject(args) {
  if (!args) return null
  return args.reduce(
    (r, a) => ({ ...r, [a.name.value]: parseValue(a.value) }),
    {},
  )
}

function parseValue(value) {
  if (value.kind === 'ObjectValue') {
    return value.fields.reduce(
      (r, a) => ({ ...r, [a.name.value]: parseValue(a.value) }),
      {},
    )
  } else if (value.kind === 'FloatValue') {
    return parseFloat(value.value)
  } else {
    return value.value
  }
}
