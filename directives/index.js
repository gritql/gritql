"use strict";
exports.__esModule = true;
exports.parseDirective = exports.postExecutedDirectives = exports.preExecutedDirectives = void 0;
var arguments_1 = require("../arguments");
var progressive_1 = require("../progressive");
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
    // omit: (context: PostExecutedContext) => {},
    // Argumnets
    // to: query name
    // diff: (context: PostExecutedContext) => {}
    // Divide value by max value
    // Arguments
    // to: query name
    indexed: function (context) {
        if (!context.tree.arguments) {
            throw 'Indexed directive requires arguments';
        }
        var args = arguments_1.argumentsToObject(context.tree.arguments);
        if (!args.to) {
            throw "Indexed directive requires 'to' argument";
        }
        var transformer = function (_a) {
            var value = _a.value, originFullObject = _a.originFullObject;
            function calculateMax(val) {
                context.data.max = Math.max(val, context.data.max || 0);
            }
            if (context.data.max == null && originFullObject) {
                progressive_1.iterateProgressive(originFullObject[context.query.name], context.path, calculateMax);
                progressive_1.iterateProgressive(originFullObject[args.to], context.path, calculateMax);
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
    }
};
function parseDirective(tree, query, path) {
    if (!query.directives)
        query.directives = [];
    if (tree.directives) {
        tree.directives.forEach(function (directive) {
            if (exports.postExecutedDirectives[directive.name.value]) {
                query.directives.push(exports.postExecutedDirectives[directive.name.value]({
                    tree: directive,
                    caller: tree,
                    path: path || query.path,
                    query: query,
                    data: {}
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
