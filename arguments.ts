export function argumentsToObject(args) {
  if (!args) return null
  return args.reduce((r, a) => ({ ...r, [a.name.value]: a.value.value }), {})
}
