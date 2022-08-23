import { argumentsToObject } from './arguments'
import { $typeSymbol, parseDirective } from './directives'
import { transformFilters } from './filters'
import { checkPropTypes, PropTypes } from './types'

export function parseMetric(tree, query, knex) {
  if (query.metricResolvers[tree.name?.value])
    return query.metricResolvers[tree.name?.value](tree, query, knex)
  else return query.metricResolvers.default(tree, query, knex)
}

export function parseDimension(tree, query, knex) {
  if (query.dimensionResolvers[tree.name?.value])
    return query.dimensionResolvers[tree.name?.value](tree, query, knex)
  else return query.dimensionResolvers.default(tree, query, knex)
}

export function parseFilters(tree, query, knex) {
  const { arguments: args } = tree
  return transformFilters(
    args.concat({ name: { value: 'from' }, value: { value: query.table } }),
    query,
    knex,
  )
}

export const defaultTypes = {
  // Basic JS types infered from PropTypes
  // That is enough to build any kind of types
  Any: PropTypes.any,
  Number: PropTypes.number,
  String: PropTypes.string,
  Bool: PropTypes.bool,
  Object: PropTypes.object,
  Array: PropTypes.array,
}

// TODO: No nested array support right now
export function parseType(type, context) {
  if (type.kind === 'UnionTypeDefinition') {
    context.types[type.name.value] = PropTypes.oneOfType(
      type.types.map((t) => {
        if (context.types[t.name.value]) {
          return context.types[t.name.value]
        } else {
          throw new Error(`${t.name.value} is not declared type`)
        }
      }),
    )
  } else if (type.kind === 'TupleTypeDefinition') {
    context.types[type.name.value] = PropTypes.tuple(
      ...type.elements.map((element) => {
        const isRequired = element.kind === 'NonNullType'
        element = element.type || element

        if (context.types[element.name.value]) {
          let type = context.types[element.name.value]

          if (isRequired) {
            type = type.isRequired
          }

          return type
        } else {
          throw new Error(`${element.name.value} is not declared type`)
        }
      }),
    )
  } else if (type.kind === 'EnumTypeDefinition') {
    context.types[type.name.value] = PropTypes.oneOf(
      type.values.map((t) => t.name.value),
    )
  } else if (
    type.kind === 'InputObjectTypeDefinition' ||
    type.kind === 'ObjectTypeDefinition'
  ) {
    const isInput = type.kind.startsWith('Input')

    const shape = type.fields
      .filter(({ kind }) => kind !== $typeSymbol)
      .reduce((acc, field) => {
        const isRequired = field.type.kind === 'NonNullType'

        if (isRequired) {
          field.type = field.type.type
        }

        if (field.type.kind === 'NamedType') {
          if (!context.types[field.type.name.value]) {
            throw new Error(`${field.type.name.value} is not declared type`)
          }

          // TODO: Default value for object type/input field is not implemented yet
          acc[field.name.value] = context.types[field.type.name.value]
        } else if (field.type.kind === 'ListType') {
          field.type = field.type.type

          const isRequired = field.type.kind === 'NonNullType'

          if (isRequired) {
            field.type = field.type.type
          }

          if (!context.types[field.type.name.value]) {
            throw new Error(`${field.type.name.value} is not declared type`)
          }

          acc[field.name.value] = context.types[field.type.name.value]

          if (isRequired) {
            acc[field.name.value] = acc[field.name.value].isRequired
          }

          acc[field.name.value] = PropTypes.arrayOf(acc[field.name.value])
        }

        if (isRequired) {
          acc[field.name.value] = acc[field.name.value].isRequired
        }

        return acc
      }, {})

    const symbolField = type.fields.filter(
      ({ kind }) => kind === $typeSymbol,
    )[0]

    if (type.options?.isMapped && !context.types[symbolField.type.name.value]) {
      throw new Error(`${symbolField.type.name.value} is not declared type`)
    }

    if (type.name.value === 'BrandFilter') {
      console.log(shape, JSON.stringify(type))
    }

    context.types[type.name.value] = type.options?.isMapped
      ? PropTypes.map(
          shape,
          PropTypes[symbolField.key.name.value.toLowerCase()].isRequired,
          context.types[symbolField.type.name.value],
        )
      : PropTypes[isInput ? 'shape' : 'exact'](shape)
  }

  return context
}

export function parseVariableDefinition(def, context) {
  const name = def?.variable?.name?.value
  const isRequired = def.type.kind === 'NonNullType'

  if (isRequired) {
    def.type = def.type.type
  }

  if (def.type.kind === 'NamedType') {
    if (context.types[def.type.name.value]) {
      context.variablesValidator[name] = context.types[def.type.name.value]
    } else {
      throw new Error(`${def.type.name.value} is not declared type`)
    }
  } else if (def.type.kind === 'ListType') {
    def.type = def.type.type

    const isRequired = def.type.kind === 'NonNullType'

    if (isRequired) {
      def.type = def.type.type
    }

    if (context.types[def.type.name.value]) {
      context.variablesValidator[name] = context.types[def.type.name.value]
    } else {
      throw new Error(`${def.type.name.value} is not declared type`)
    }

    if (isRequired) {
      context.variablesValidator[name] =
        context.variablesValidator[name].isRequired
    }

    context.variablesValidator[name] = PropTypes.arrayOf(
      context.variablesValidator[name],
    )

    if (!!def.defaultValue) {
      context.variables[name] =
        context.variables[name] ?? argumentsToObject(def.defaultValue)
    }
  }

  if (isRequired) {
    context.variablesValidator[name] =
      context.variablesValidator[name].isRequired
  }

  return context
}

export function processArguments(args, context) {
  return args
    .map((argument) => {
      if (argument.value?.kind === 'Variable') {
        if (context.variables[argument.value.name.value] !== undefined) {
          return {
            ...argument,
            value: {
              kind: 'JSONValue',
              value: context.variables[argument.value.name.value],
            },
          }
        } else {
          return null
        }
      } else if (argument.value?.kind === 'ObjectValue') {
        argument.value.fields = processArguments(argument.value.fields, context)
      } else if (argument.value?.kind === 'ListValue') {
        argument.value.values = processArguments(argument.value.values, context)
      }

      return argument
    })
    .filter(Boolean)
}

export function processSelections(selections, field, query, context) {
  if (field?.kind === 'FragmentSpread') {
    if (context.fragments[field.name.value]) {
      selections = selections.concat(
        compileFragment(context.fragments[field.name.value], query, []),
      )

      return selections
    } else {
      throw new Error(`${field.name.value} fragment is not defined yet`)
    }
  }

  if (field?.name.value === 'use') {
    const { fragment, args } = {
      args: field.arguments.filter((f) => f.name.value !== 'fragment'),
      fragment: field.arguments.filter((f) => f.name.value === 'fragment'),
    }

    if (fragment.length) {
      if (context.fragments[fragment[0].value.value]) {
        selections = selections.concat(
          compileFragment(
            context.fragments[fragment[0].value.value],
            query,
            args,
          ),
        )

        return selections
      } else {
        throw new Error(`${field.name.value} fragment is not defined yet`)
      }
    } else {
      throw new Error(
        `use requires fragment arguments with name of fragment which you want to compile`,
      )
    }
  }

  if (field?.directives) {
    field.directives = field.directives.map((directive) => {
      if (directive.arguments) {
        directive.arguments = processArguments(directive.arguments, context)
      }

      return directive
    })

    field = parseDirective(field, null, 'field')
  }

  if (field?.arguments) {
    field.arguments = processArguments(field.arguments, context)
  }

  if (field?.selectionSet) {
    field.selectionSet.selections = field.selectionSet.selections
      .reduce(
        (selections, field) =>
          processSelections(selections, field, query, context),
        [],
      )
      .filter(Boolean)
  }

  if (field) {
    selections.push(field)
  }

  return selections
}

export function compileFragment(fragment, query, arglist: any) {
  const args = argumentsToObject(arglist)

  const context = {
    types: query.context.types,
    variables: {
      ...query.context.variables,
      ...args,
    },
    variablesValidator: {},
  }

  if (fragment.variableDefinitions) {
    fragment.variableDefinitions.map((def) => {
      parseVariableDefinition(def, context)
    })

    checkPropTypes(
      context.variablesValidator,
      context.variables,
      'fragment',
      fragment.name.value,
    )
  }

  return fragment.selections
    .reduce(
      (selections, field) =>
        processSelections(selections, field, query, context),
      [],
    )
    .filter(Boolean)
}
