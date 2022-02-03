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
exports.argumentsToObject = void 0;
function argumentsToObject(args) {
    if (!args)
        return null;
    return args.reduce(function (r, a) {
        var _a;
        return (__assign(__assign({}, r), (_a = {}, _a[a.name.value] = parseValue(a.value), _a)));
    }, {});
}
exports.argumentsToObject = argumentsToObject;
function parseValue(value) {
    if (value.kind === 'ObjectValue') {
        return value.fields.reduce(function (r, a) {
            var _a;
            return (__assign(__assign({}, r), (_a = {}, _a[a.name.value] = parseValue(a.value), _a)));
        }, {});
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
