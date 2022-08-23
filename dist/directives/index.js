"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTypeDirective = exports.parseDirective = exports.postExecutedDirectives = exports.preExecutedDirectives = exports.typeDirectives = exports.$typeSymbol = void 0;
const arguments_1 = require("../arguments");
const progressive_1 = require("../progressive");
const luxon_1 = require("luxon");
const resolvers = {
    in: (a, b) => {
        if (!Array.isArray(b) && !Array.isArray(a)) {
            throw new Error('Argument `in` or value must be an array');
        }
        if (Array.isArray(b)) {
            return b.includes(a);
        }
        else if (Array.isArray(a)) {
            return a.includes(b);
        }
    },
    nin: (a, b) => {
        if (!Array.isArray(b) && !Array.isArray(a)) {
            throw new Error('Argument `nin` or value must be an array');
        }
        if (Array.isArray(b)) {
            return !b.includes(a);
        }
        else if (Array.isArray(a)) {
            return !a.includes(b);
        }
    },
    eq: (a, b) => {
        return a == b;
    },
    gte: (a, b) => {
        return a >= b;
    },
    gt: (a, b) => {
        return a > b;
    },
    lt: (a, b) => {
        return a < b;
    },
    lte: (a, b) => {
        return a <= b;
    },
    neq: (a, b) => {
        return a != b;
    },
    of: (a, b) => {
        if (!Array.isArray(a)) {
            throw new Error('Value must be an array');
        }
        if (Array.isArray(b)) {
            return b.some((bv) => {
                const bt = typeof bv;
                return a.every((av) => {
                    const at = typeof av;
                    if (at !== bt) {
                        return false;
                    }
                    if (bt === 'object') {
                        return Object.keys(bv).every((k) => av[k] === bv[k]);
                    }
                    else {
                        return av === bv;
                    }
                });
            });
        }
        else {
            const bt = typeof b;
            return a.every((av) => {
                const at = typeof av;
                if (at !== bt) {
                    return false;
                }
                if (bt === 'object') {
                    return Object.keys(b).every((k) => av[k] === b[k]);
                }
                else {
                    return av === b;
                }
            });
        }
    },
    nof: (a, b) => {
        if (!Array.isArray(a)) {
            throw new Error('Value must be an array');
        }
        if (Array.isArray(b)) {
            return !b.some((bv) => {
                const bt = typeof bv;
                return a.every((av) => {
                    const at = typeof av;
                    if (at !== bt) {
                        return false;
                    }
                    if (bt === 'object') {
                        return Object.keys(bv).every((k) => av[k] === bv[k]);
                    }
                    else {
                        return av === bv;
                    }
                });
            });
        }
        else {
            const bt = typeof b;
            return !a.every((av) => {
                const at = typeof av;
                if (at !== bt) {
                    return false;
                }
                if (bt === 'object') {
                    return Object.keys(b).every((k) => av[k] === b[k]);
                }
                else {
                    return av === b;
                }
            });
        }
    },
};
function findResolvers(keys, value, args, name) {
    return keys.some((k) => {
        const resolver = resolvers[k] || resolvers.eq;
        const isNotDefaultResolver = !!resolvers[k];
        return !resolver(value, args[isNotDefaultResolver && name ? `${name}_${k}` : k]);
    });
}
function filterPropertyKey(keys, key) {
    return keys
        .filter((k) => k.startsWith(key + '_') || k === key)
        .map((k) => k.split('_').slice(-1)[0]);
}
exports.$typeSymbol = Symbol('Type field definition');
exports.typeDirectives = {
    inherits: (type, args, context) => {
        if (!args || !args.name) {
            throw new Error('Inherits directive requires `name` argument');
        }
        if (!context.typeDefinitions[args.name]) {
            throw new Error(`Type "${args.name}" is not defined`);
        }
        if (type.kind !== context.typeDefinitions[args.name].kind) {
            throw new Error(`Can't inherits ${type.kind} from ${context.typeDefinitions[args.name].kind}`);
        }
        if (type.kind === 'ObjectTypeDefinition' ||
            type.kind === 'InputObjectTypeDefinition') {
            console.log(JSON.stringify({
                ...type,
                directives: type.directives.slice(1),
                fields: [
                    ...context.typeDefinitions[args.name].fields,
                    ...type.fields,
                ],
            }));
            return {
                ...type,
                directives: type.directives.slice(1),
                fields: [...context.typeDefinitions[args.name].fields, ...type.fields],
            };
        }
        else if (type.kind === 'UnionTypeDefinition') {
            return {
                ...type,
                directives: type.directives.slice(1),
                types: [...context.typeDefinitions[args.name].types, ...type.types],
            };
        }
        else {
            return {
                ...type,
                directives: type.directives.slice(1),
                values: [...context.typeDefinitions[args.name].values, ...type.values],
            };
        }
    },
    map: (type, args, context) => {
        if (!args) {
            throw new Error('Map directive requires arguments');
        }
        if (!args.key) {
            throw new Error('Map directive requires `key` type');
        }
        if (!args.value) {
            throw new Error('Map directive requires `value` type');
        }
        if ((!['String', 'Number'].includes(args.key) &&
            !context.typeDefinitions[args.key]) ||
            (!['String', 'Number'].includes(args.value) &&
                !context.typeDefinitions[args.value])) {
            throw new Error(`Type "${args.key}" or "${args.value}" is not defined`);
        }
        if (type.kind !== 'ObjectTypeDefinition' &&
            type.kind !== 'InputObjectTypeDefinition') {
            throw new Error('Map can be applied only to `type` or `input` definition');
        }
        let fields = [];
        if (['String', 'Number'].includes(args.key)) {
            fields.push({
                kind: exports.$typeSymbol,
                key: {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: args.key,
                    },
                },
                type: {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: args.value,
                    },
                },
            });
        }
        else if (context.typeDefinitions[args.key].kind === 'EnumTypeDefinition') {
            fields = context.typeDefinitions[args.key].values.map((enumValue) => {
                let type = {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: args.value,
                    },
                };
                if (args.isRequired) {
                    const newType = {
                        kind: 'NonNullType',
                        type,
                    };
                    type = newType;
                }
                return {
                    kind: 'FieldDefinition',
                    name: enumValue.name,
                    type,
                };
            });
        }
        else {
            throw new Error(`${context.typeDefinitions[args.key].kind} can't be used as "key" type`);
        }
        console.log(JSON.stringify(type));
        return {
            ...type,
            directives: type.directives.slice(1),
            options: {
                ...type.options,
                isMapped: type.options?.isMapped || ['String', 'Number'].includes(args.key),
            },
            fields: [...fields, ...type.fields],
        };
    },
    tuple: (type, args, context) => {
        if (!args) {
            throw new Error('Tuple directive requires arguments');
        }
        if (!args.len && !args.definitions) {
            throw new Error('Tuple directive requires `len` or `definitions` argument');
        }
        if (args.len && args.definitions) {
            throw new Error('Tuple can parse only one argument at one time (`len` or `definitions`)');
        }
        if (args.definitions && !Array.isArray(args.definitions)) {
            throw new Error('Tuple directive requires argument `definitions` to be an array');
        }
        if (type.kind !== 'ObjectTypeDefinition' &&
            type.kind !== 'InputObjectTypeDefinition') {
            throw new Error('Tuple can be applied only to `type` or `input` definition');
        }
        if (type.fields.length && args.definitions) {
            throw new Error("Object type can't be combined with tuple with definitions");
        }
        return [
            !!args.len && {
                ...type,
                directives: [],
                name: {
                    ...type.name,
                    value: `TupleElementFor${type.name.value}`,
                },
            },
            {
                kind: 'TupleTypeDefinition',
                name: {
                    kind: 'Name',
                    value: type.name.value,
                },
                directives: type.directives.slice(1),
                elements: args.definitions
                    ? args.definitions.map((definition) => {
                        if (typeof definition === 'string') {
                            return args.isRequired
                                ? {
                                    kind: 'NonNullType',
                                    type: {
                                        kind: 'NamedType',
                                        name: {
                                            kind: 'Name',
                                            value: definition,
                                        },
                                    },
                                }
                                : {
                                    kind: 'NamedType',
                                    name: {
                                        kind: 'Name',
                                        value: definition,
                                    },
                                };
                        }
                        else if (typeof definition === 'object') {
                            return args.isRequired || definition.isRequired
                                ? {
                                    kind: 'NonNullType',
                                    type: {
                                        kind: 'NamedType',
                                        name: {
                                            kind: 'Name',
                                            value: definition.name,
                                        },
                                    },
                                }
                                : {
                                    kind: 'NamedType',
                                    name: {
                                        kind: 'Name',
                                        value: definition.name,
                                    },
                                };
                        }
                        else {
                            throw new Error('Tuple directive requiers `definitions` argument to be an array of strings or definition object');
                        }
                    })
                    : Array(args.len).map(() => args.isRequired
                        ? {
                            kind: 'NonNullType',
                            type: {
                                kind: 'NamedType',
                                name: {
                                    kind: 'Name',
                                    value: `TupleElementFor${type.name.value}`,
                                },
                            },
                        }
                        : {
                            kind: 'NamedType',
                            name: {
                                kind: 'Name',
                                value: `TupleElementFor${type.name.value}`,
                            },
                        }),
            },
        ].filter(Boolean);
    },
};
exports.preExecutedDirectives = {
    // if: Boolean to compare
    // Skips metric/dimension when 'if' argument is false
    include: (context) => {
        if (context.caller?.data?.value !== undefined) {
            if (!context.caller.data.value) {
                return null;
            }
            else {
                return context.caller;
            }
        }
        if (!context.tree.arguments) {
            throw new Error('Include directive requires arguments or result of previous directive');
        }
        const args = (0, arguments_1.argumentsToObject)(context.tree.arguments);
        if (args.if === undefined) {
            throw new Error('Include directive requires `if` argument');
        }
        if (args.if) {
            return context.caller;
        }
        else {
            return null;
        }
    },
    // if: Boolean to compare
    // Skips metric/dimension when 'if' argument is true
    skip: (context) => {
        if (context.caller?.data?.value !== undefined) {
            if (context.caller.data.value) {
                return null;
            }
            else {
                return context.caller;
            }
        }
        if (!context.tree.arguments) {
            throw new Error('Skip directive requires arguments or result of previous directive');
        }
        const args = (0, arguments_1.argumentsToObject)(context.tree.arguments);
        if (args.if === undefined) {
            throw new Error('Skip directive requires `if` argument');
        }
        if (!args.if) {
            return context.caller;
        }
        else {
            return null;
        }
    },
    compare: (context) => {
        if (!context.tree.arguments) {
            throw new Error('Compare directive requires arguments');
        }
        let { value, ...rest } = (0, arguments_1.argumentsToObject)(context.tree.arguments);
        value = value ?? context.caller?.data?.value;
        if (value === undefined) {
            throw new Error('Compare directive requires `value` argument or result of previous directive');
        }
        if (Object.keys(rest).length === 0) {
            throw new Error('Compare directive requires at least one argument ([`eq`, `in`, `neq`, `lt`, `gt`, `lte`, `gte`, `of`, `nof`]) to compare with value');
        }
        value = Object.keys(rest).reduce((value, key) => {
            if (resolvers[key] && value !== false) {
                return resolvers[key](value, rest[key]);
            }
            else {
                throw new Error(`Can't find resolver for '${key}'`);
            }
        }, value);
        context.caller.data = {
            ...context.caller.data,
            value,
        };
        return context.caller;
    },
};
exports.postExecutedDirectives = {
    // Arguments
    // to: query name
    // pick: (context: PostExecutedContext) => {
    //
    // },
    omit: (context) => {
        const args = (0, arguments_1.argumentsToObject)(context.tree.arguments);
        const transformer = ({ originFullObject }) => {
            return {
                skip: args?.full ? true : !!originFullObject,
            };
        };
        transformer.context = context;
        return transformer;
    },
    // Argumnets
    // by: query name
    diff: (context) => {
        if (!context.tree.arguments) {
            throw 'Diff directive requires arguments';
        }
        const args = (0, arguments_1.argumentsToObject)(context.tree.arguments);
        if (!args.by) {
            throw "Diff directive requires 'by' argument";
        }
        const transformer = ({ replacedPath, originFullObject, value, batches, }) => {
            if (originFullObject) {
                return {
                    value: value /
                        (0, progressive_1.progressiveGet)(originFullObject[args.by], replacedPath, (0, progressive_1.getBatchContext)(batches, args.by)) -
                        1,
                };
            }
            else {
                return { value };
            }
        };
        transformer.context = context;
        return transformer;
    },
    // Argumnets
    // by: query name
    subtract: (context) => {
        if (!context.tree.arguments) {
            throw 'Subtract directive requires arguments';
        }
        const args = (0, arguments_1.argumentsToObject)(context.tree.arguments);
        if (!args.by) {
            throw "Subtract directive requires 'by' argument";
        }
        const transformer = ({ replacedPath, originFullObject, value, batches, }) => {
            if (originFullObject) {
                return {
                    value: value -
                        (0, progressive_1.progressiveGet)(originFullObject[args.by], replacedPath, (0, progressive_1.getBatchContext)(batches, args.by)),
                };
            }
            else {
                return { value };
            }
        };
        transformer.context = context;
        return transformer;
    },
    // Divide value by max value
    // Arguments
    // to: query name
    // or
    // group: group name
    indexed: (context) => {
        if (!context.tree.arguments) {
            throw 'Indexed directive requires arguments';
        }
        const args = (0, arguments_1.argumentsToObject)(context.tree.arguments);
        if (!args.to && !args.group) {
            throw "Indexed directive requires 'to' or 'group' argument";
        }
        else if (args.to && args.group) {
            throw "Indexed directive can handle only 'to' or 'group' argument at once";
        }
        context.data.members = new Set();
        context.data.members.add(context.query.name);
        // Paths within one group could be different, we need to handle it
        context.data.pathMap = { [context.query.name]: [context.path] };
        if (!args.group) {
            context.data.members.add(args.to);
            context.data.pathMap[args.to] = [context.path];
        }
        else {
            context.data.group = args.group;
        }
        const transformer = ({ value, originFullObject, batches }) => {
            function calculateMax(val) {
                context.data.max = Math.max(val, context.data.max || 0);
            }
            if (args.group) {
                if (!context.data.groupingIsDone) {
                    Object.keys(batches).forEach((k) => {
                        batches[k].forEach((q) => {
                            const directives = q.directives.filter((d) => d.context.data.group === context.data.group &&
                                d.context.type === 'indexed');
                            if (directives.length > 0) {
                                context.data.members.add(q.name);
                                context.data.pathMap[q.name] =
                                    context.data.pathMap[q.name] || [];
                                directives.forEach((d) => {
                                    context.data.pathMap[q.name].push(d.context.path);
                                });
                            }
                        });
                    });
                    context.data.groupingIsDone = true;
                }
            }
            if (context.data.max == null && originFullObject) {
                Array.from(context.data.members).forEach((member) => {
                    const paths = context.data.pathMap[member];
                    paths.forEach((path) => {
                        (0, progressive_1.iterateProgressive)(originFullObject[member], path, calculateMax);
                    });
                });
            }
            if (context.data.max != null) {
                return { value: value / context.data.max };
            }
            else {
                return { value };
            }
        };
        transformer.context = context;
        return transformer;
    },
    // Arguments
    // For dimensions
    // [metricName: name]: any
    // [[`${metricName}_gt`]]: any
    // [[`${metricName}_gte`]]: any
    // [[`${metricName}_lt`]]: any
    // [[`${metricName}_lte`]]: any
    // [[`${metricName}_in`]]: any
    // For metrics
    // in: any[]
    // lte: any
    // lt: any
    // gte: any
    // eq: any
    // gt: any
    // of: any[] | any
    // nof: any[] | any
    filter: (context) => {
        if (!context.tree.arguments) {
            throw 'Filter directive requires arguments';
        }
        const args = (0, arguments_1.argumentsToObject)(context.tree.arguments);
        context.data.members = new Set();
        const transformer = ({ value, globalReplacedPath, originFullObject, row, batches, q, }) => {
            if (originFullObject) {
                const argsKeys = Object.keys(args);
                if (context.on === 'metric') {
                    return {
                        skip: findResolvers(argsKeys, value, args),
                    };
                }
                else {
                    if (context.data.members.has(row)) {
                        return {
                            skip: true,
                            skipAll: true,
                        };
                    }
                    const globalObj = (0, progressive_1.progressiveGet)(Object.keys(batches).length > 1 || context.query.name
                        ? originFullObject[context.query.name]
                        : originFullObject, globalReplacedPath, q.hashContext);
                    if (!globalObj) {
                        context.data.members.add(row);
                        return {
                            skip: true,
                            skipAll: true,
                        };
                    }
                    const skip = Object.keys(globalObj).some((key) => {
                        const keys = filterPropertyKey(argsKeys, key);
                        return keys.length > 0
                            ? findResolvers(keys, globalObj[key], args, key)
                            : false;
                    });
                    if (skip) {
                        context.data.members.add(row);
                    }
                    return {
                        skip,
                        skipAll: skip,
                    };
                }
            }
            else {
                return {};
            }
        };
        transformer.context = context;
        return transformer;
    },
    // Arguments
    // [metricName: name]: any
    // [[`${metricName}_gt`]]: any
    // [[`${metricName}_gte`]]: any
    // [[`${metricName}_lt`]]: any
    // [[`${metricName}_lte`]]: any
    // [[`${metricName}_in`]]: any
    // replacers: Replacers which need to be applyied when grouped
    // current behavior of grouping:
    // * determine what we can group
    // * sum numbers && use last string
    // * replace via replacers
    groupOn: (context) => {
        if (!context.tree.arguments) {
            throw 'GroupOn directive requires arguments';
        }
        const args = (0, arguments_1.argumentsToObject)(context.tree.arguments);
        context.data.members = new Set();
        context.data.checked = new Set();
        const argsKeys = Object.keys(args).filter((k) => k !== 'replacers');
        if (argsKeys.length === 0) {
            throw 'GroupOn directive requires at least one grouping condition';
        }
        const transfomer = ({ row, path, data, value, key, globalReplacedPath, originFullObject, batches, result, q, }) => {
            if (!originFullObject) {
                return {};
            }
            const currentData = (0, progressive_1.progressiveGet)(Object.keys(batches).length > 1 || context.query.name
                ? originFullObject[context.query.name]
                : originFullObject, globalReplacedPath, q.hashContext);
            const isNotFirstTime = context.data.members.has(row);
            const isAlreadyChecked = context.data.checked.has(row);
            const matched = isNotFirstTime ||
                (!isAlreadyChecked &&
                    Object.keys(currentData).some((key) => {
                        const keys = filterPropertyKey(argsKeys, key);
                        return keys.length > 0
                            ? !findResolvers(keys, currentData[key], args, key)
                            : false;
                    }));
            context.data.checked.add(row);
            if (matched) {
                context.data.members.add(row);
                const newPath = (0, progressive_1.replVars)(path, { ...data, ...args.replacers }).replace(/:join\./g, '');
                const currentGroupData = (0, progressive_1.progressiveGet)(result, newPath.replace(new RegExp(`\\.${key}$`), ''), q.hashContext);
                const newValue = typeof currentGroupData?.[key] === 'number'
                    ? currentGroupData?.[key] + value
                    : value;
                return {
                    replacers: !isNotFirstTime
                        ? {
                            ...currentData,
                            ...currentGroupData,
                            [key]: newValue,
                            ...args.replacers,
                        }
                        : null,
                    path: newPath,
                    value: newValue,
                    skip: !isNotFirstTime,
                };
            }
            else {
                return {};
            }
        };
        transfomer.context = context;
        return transfomer;
    },
    groupBy: (context) => {
        if (!context.tree.arguments) {
            throw 'GroupBy directive requires arguments';
        }
        const args = (0, arguments_1.argumentsToObject)(context.tree.arguments);
        context.data.checked = {};
        if (!args.by) {
            throw "GroupBy directive requires 'by' argument";
        }
        const targetKey = context.caller.alias?.value || context.caller.name.value;
        const transfomer = ({ row, path, data, value, key, globalReplacedPath, originFullObject, batches, result, q, }) => {
            if (!originFullObject) {
                return {};
            }
            const currentData = (0, progressive_1.progressiveGet)(Object.keys(batches).length > 1 || context.query.name
                ? originFullObject[context.query.name]
                : originFullObject, globalReplacedPath, q.hashContext);
            const isNotFirstTime = !!context.data.checked[row];
            const transfomeredKey = !isNotFirstTime
                ? luxon_1.DateTime.fromISO(data[targetKey]).startOf(args.by).toISODate()
                : context.data.checked[row];
            context.data.checked[row] = transfomeredKey;
            const newPath = (0, progressive_1.replVars)(path, { ...data, [targetKey]: transfomeredKey });
            const currentGroupData = (0, progressive_1.progressiveGet)(result, newPath.replace(new RegExp(`\\.${key}$`), ''), q.hashContext);
            const newValue = typeof currentGroupData?.[key] === 'number'
                ? currentGroupData?.[key] + value
                : value;
            return {
                replacers: !isNotFirstTime
                    ? {
                        ...currentData,
                        ...currentGroupData,
                        [targetKey]: transfomeredKey,
                        [key]: newValue,
                    }
                    : null,
                path: newPath,
                value: newValue,
                skip: !isNotFirstTime,
            };
        };
        transfomer.context = context;
        return transfomer;
    },
    // Arguments
    // by: Query name
    // byField: second field name
    divide: (context) => {
        if (!context.tree.arguments) {
            throw 'Diff directive requires arguments';
        }
        const args = (0, arguments_1.argumentsToObject)(context.tree.arguments);
        if (!(args.by || args.byField)) {
            throw "Diff directive requires 'by' or 'byField' argument";
        }
        const transformer = ({ replacedPath, originFullObject, value, key, batches, }) => {
            if (originFullObject) {
                return {
                    value: value /
                        (0, progressive_1.progressiveGet)(originFullObject[args.by
                            ? args.by
                            : Object.keys(batches).length > 1 || context.query.name
                                ? originFullObject[context.query.name]
                                : originFullObject], args.byField
                            ? replacedPath.replace(new RegExp(`\\.${key}$`), args.byField)
                            : replacedPath, (0, progressive_1.getBatchContext)(batches, args.by ? args.by : context.query.name)),
                };
            }
            else {
                return { value };
            }
        };
        transformer.context = context;
        return transformer;
    },
};
function parseDirective(tree, query, on, path) {
    if (query && !query.directives)
        query.directives = [];
    if (tree.directives) {
        return tree.directives.reduce((tree, directive, i) => {
            if (!directive) {
                return tree;
            }
            if (exports.preExecutedDirectives[directive.name.value]) {
                tree = exports.preExecutedDirectives[directive.name.value]({
                    tree: directive,
                    caller: tree,
                    query,
                    data: {},
                    type: directive.name.value,
                    on,
                });
            }
            if (query && exports.postExecutedDirectives[directive.name.value]) {
                query.directives.push(exports.postExecutedDirectives[directive.name.value]({
                    tree: directive,
                    caller: tree,
                    path: path || query.path,
                    query,
                    data: {},
                    type: directive.name.value,
                    on,
                    name: tree.alias?.value || tree.name?.value,
                }));
            }
            return tree;
        }, tree);
    }
    return tree;
}
exports.parseDirective = parseDirective;
function parseTypeDirective(tree, context) {
    return tree.directives
        ? tree.directives.reduce((tree, directive) => {
            return exports.typeDirectives[directive.name.value]
                ? exports.typeDirectives[directive.name.value](Array.isArray(tree) ? tree[tree.length - 1] : tree, (0, arguments_1.argumentsToObject)(directive.arguments), context)
                : tree;
        }, tree)
        : tree;
}
exports.parseTypeDirective = parseTypeDirective;
