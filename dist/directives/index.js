"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDirective = exports.postExecutedDirectives = exports.preExecutedDirectives = void 0;
const arguments_1 = require("../arguments");
const progressive_1 = require("../progressive");
const luxon_1 = require("luxon");
const resolvers = {
    in: (a, b) => {
        return b.includes(a);
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
            throw new Error('Compare directive requires at least one argument ([`eq`, `in`, `neq`, `lt`, `gt`, `lte`, `gte`]) to compare with value');
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
    // in: any
    // lte: any
    // lt: any
    // gte: any
    // eq: any
    // gt: any
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
