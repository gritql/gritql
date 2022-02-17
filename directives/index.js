"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
exports.__esModule = true;
exports.parseDirective = exports.postExecutedDirectives = exports.preExecutedDirectives = void 0;
var arguments_1 = require("../arguments");
var progressive_1 = require("../progressive");
var resolvers = {
    "in": function (a, b) {
        return b.includes(a);
    },
    eq: function (a, b) {
        return a == b;
    },
    gte: function (a, b) {
        return a >= b;
    },
    gt: function (a, b) {
        return a > b;
    },
    lt: function (a, b) {
        return a < b;
    },
    lte: function (a, b) {
        return a <= b;
    }
};
function findResolvers(keys, value, args, name) {
    return keys.some(function (k) {
        var resolver = resolvers[k] || resolvers.eq;
        var isNotDefaultResolver = !!resolvers[k];
        return !resolver(value, args[isNotDefaultResolver && name ? name + "_" + k : k]);
    });
}
function filterPropertyKey(keys, key) {
    return keys
        .filter(function (k) { return k.startsWith(key + '_') || k === key; })
        .map(function (k) { return k.split('_').slice(-1)[0]; });
}
exports.preExecutedDirectives = {
// include: (context: PreExecutedContext) => {},
// skip: (context: PreExecutedContext) => {},
};
exports.postExecutedDirectives = {
    // Arguments
    // to: query name
    // pick: (context: PostExecutedContext) => {
    //
    // },
    omit: function (context) {
        var args = arguments_1.argumentsToObject(context.tree.arguments);
        var transformer = function (_a) {
            var originFullObject = _a.originFullObject;
            return {
                skip: (args === null || args === void 0 ? void 0 : args.full) ? true : !!originFullObject
            };
        };
        transformer.context = context;
        return transformer;
    },
    // Argumnets
    // by: query name
    diff: function (context) {
        if (!context.tree.arguments) {
            throw 'Diff directive requires arguments';
        }
        var args = arguments_1.argumentsToObject(context.tree.arguments);
        if (!args.by) {
            throw "Diff directive requires 'by' argument";
        }
        var transformer = function (_a) {
            var replacedPath = _a.replacedPath, originFullObject = _a.originFullObject, value = _a.value, batches = _a.batches;
            if (originFullObject) {
                return {
                    value: value /
                        progressive_1.progressiveGet(originFullObject[args.by], replacedPath, progressive_1.getBatchContext(batches, args.by)) -
                        1
                };
            }
            else {
                return { value: value };
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
    indexed: function (context) {
        var _a;
        if (!context.tree.arguments) {
            throw 'Indexed directive requires arguments';
        }
        var args = arguments_1.argumentsToObject(context.tree.arguments);
        if (!args.to && !args.group) {
            throw "Indexed directive requires 'to' or 'group' argument";
        }
        else if (args.to && args.group) {
            throw "Indexed directive can handle only 'to' or 'group' argument at once";
        }
        context.data.members = new Set();
        context.data.members.add(context.query.name);
        // Paths within one group could be different, we need to handle it
        context.data.pathMap = (_a = {}, _a[context.query.name] = [context.path], _a);
        if (!args.group) {
            context.data.members.add(args.to);
            context.data.pathMap[args.to] = [context.path];
        }
        else {
            context.data.group = args.group;
        }
        var transformer = function (_a) {
            var value = _a.value, originFullObject = _a.originFullObject, batches = _a.batches;
            function calculateMax(val) {
                context.data.max = Math.max(val, context.data.max || 0);
            }
            if (args.group) {
                if (!context.data.groupingIsDone) {
                    Object.keys(batches).forEach(function (k) {
                        batches[k].forEach(function (q) {
                            var directives = q.directives.filter(function (d) {
                                return d.context.data.group === context.data.group &&
                                    d.context.type === 'indexed';
                            });
                            if (directives.length > 0) {
                                context.data.members.add(q.name);
                                context.data.pathMap[q.name] =
                                    context.data.pathMap[q.name] || [];
                                directives.forEach(function (d) {
                                    context.data.pathMap[q.name].push(d.context.path);
                                });
                            }
                        });
                    });
                    context.data.groupingIsDone = true;
                }
            }
            if (context.data.max == null && originFullObject) {
                Array.from(context.data.members).forEach(function (member) {
                    var paths = context.data.pathMap[member];
                    paths.forEach(function (path) {
                        progressive_1.iterateProgressive(originFullObject[member], path, calculateMax);
                    });
                });
            }
            if (context.data.max != null) {
                return { value: value / context.data.max };
            }
            else {
                return { value: value };
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
    filter: function (context) {
        if (!context.tree.arguments) {
            throw 'Filter directive requires arguments';
        }
        var args = arguments_1.argumentsToObject(context.tree.arguments);
        context.data.members = new Set();
        var transformer = function (_a) {
            var value = _a.value, globalReplacedPath = _a.globalReplacedPath, originFullObject = _a.originFullObject, row = _a.row, batches = _a.batches, q = _a.q;
            if (originFullObject) {
                var argsKeys_1 = Object.keys(args);
                if (context.on === 'metric') {
                    return {
                        skip: findResolvers(argsKeys_1, value, args)
                    };
                }
                else {
                    if (context.data.members.has(row)) {
                        return {
                            skip: true,
                            skipAll: true
                        };
                    }
                    var globalObj_1 = progressive_1.progressiveGet(Object.keys(batches).length > 1 || context.query.name
                        ? originFullObject[context.query.name]
                        : originFullObject, globalReplacedPath, q.hashContext);
                    if (!globalObj_1) {
                        context.data.members.add(row);
                        return {
                            skip: true,
                            skipAll: true
                        };
                    }
                    var skip = Object.keys(globalObj_1).some(function (key) {
                        var keys = filterPropertyKey(argsKeys_1, key);
                        return keys.length > 0
                            ? findResolvers(keys, globalObj_1[key], args, key)
                            : false;
                    });
                    if (skip) {
                        context.data.members.add(row);
                    }
                    return {
                        skip: skip,
                        skipAll: skip
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
    groupOn: function (context) {
        if (!context.tree.arguments) {
            throw 'GroupOn directive requires arguments';
        }
        var args = arguments_1.argumentsToObject(context.tree.arguments);
        context.data.members = new Set();
        context.data.checked = new Set();
        var argsKeys = Object.keys(args).filter(function (k) { return k !== 'replacers'; });
        if (argsKeys.length === 0) {
            throw 'GroupOn directive requires at least one grouping condition';
        }
        var transfomer = function (_a) {
            var _b;
            var row = _a.row, path = _a.path, data = _a.data, value = _a.value, key = _a.key, globalReplacedPath = _a.globalReplacedPath, originFullObject = _a.originFullObject, batches = _a.batches, result = _a.result, q = _a.q;
            if (!originFullObject) {
                return {};
            }
            var currentData = progressive_1.progressiveGet(Object.keys(batches).length > 1 || context.query.name
                ? originFullObject[context.query.name]
                : originFullObject, globalReplacedPath, q.hashContext);
            var isNotFirstTime = context.data.members.has(row);
            var isAlreadyChecked = context.data.checked.has(row);
            var matched = isNotFirstTime ||
                (!isAlreadyChecked &&
                    Object.keys(currentData).some(function (key) {
                        var keys = filterPropertyKey(argsKeys, key);
                        return keys.length > 0
                            ? !findResolvers(keys, currentData[key], args, key)
                            : false;
                    }));
            context.data.checked.add(row);
            if (matched) {
                context.data.members.add(row);
                var newPath = progressive_1.replVars(path, __assign(__assign({}, data), args.replacers)).replace(/:join\./g, '');
                var currentGroupData = progressive_1.progressiveGet(result, newPath.replace(new RegExp("\\." + key + "$"), ''), q.hashContext);
                var newValue = typeof (currentGroupData === null || currentGroupData === void 0 ? void 0 : currentGroupData[key]) === 'number'
                    ? (currentGroupData === null || currentGroupData === void 0 ? void 0 : currentGroupData[key]) + value
                    : value;
                return {
                    replacers: !isNotFirstTime
                        ? __assign(__assign(__assign(__assign({}, currentData), currentGroupData), (_b = {}, _b[key] = newValue, _b)), args.replacers) : null,
                    path: newPath,
                    value: newValue,
                    skip: !isNotFirstTime
                };
            }
            else {
                return {};
            }
        };
        transfomer.context = context;
        return transfomer;
    }
};
function parseDirective(tree, query, on, path) {
    if (!query.directives)
        query.directives = [];
    if (tree.directives) {
        tree.directives.forEach(function (directive) {
            var _a, _b;
            if (exports.postExecutedDirectives[directive.name.value]) {
                query.directives.push(exports.postExecutedDirectives[directive.name.value]({
                    tree: directive,
                    caller: tree,
                    path: path || query.path,
                    query: query,
                    data: {},
                    type: directive.name.value,
                    on: on,
                    name: ((_a = tree.alias) === null || _a === void 0 ? void 0 : _a.value) || ((_b = tree.name) === null || _b === void 0 ? void 0 : _b.value)
                }));
            }
            if (exports.preExecutedDirectives[directive.name.value]) {
                // TODO: support of pre executed directives
            }
        });
    }
    return tree;
}
exports.parseDirective = parseDirective;
