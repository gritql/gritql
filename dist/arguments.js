"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformLinkedArgs = exports.argumentsToObject = void 0;
function argumentsToObject(args) {
    if (!args)
        return null;
    if (Array.isArray(args)) {
        return args.reduce((r, a) => ({ ...r, [a.name.value]: parseValue(a.value) }), {});
    }
    else {
        // In that case args already parsed
        return args;
    }
}
exports.argumentsToObject = argumentsToObject;
function transformLinkedArgs(args, query) {
    if (args?.from === '@') {
        args.from = query.table;
    }
    return args;
}
exports.transformLinkedArgs = transformLinkedArgs;
function parseValue(value) {
    if (value.kind === 'ObjectValue') {
        return value.fields.reduce((r, a) => ({ ...r, [a.name.value]: parseValue(a.value) }), {});
    }
    else if (value.kind === 'FloatValue') {
        return parseFloat(value.value);
    }
    else if (value.kind === 'IntValue') {
        return parseInt(value.value, 10);
    }
    else if (value.kind === 'ListValue') {
        return value.values.map(parseValue);
    }
    else {
        return value.value;
    }
}
