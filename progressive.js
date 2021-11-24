"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from) {
    for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
        to[j] = from[i];
    return to;
};
exports.__esModule = true;
exports.iterateProgressive = exports.progressiveSet = exports.progressiveGet = void 0;
function unshieldSeparator(str) {
    if (typeof str !== "string")
        return str;
    return str.replace(/\$#@#/, ".");
}
/*
var k = {};
progressiveSet(k, 'book.test.one', 1)
progressiveSet(k, 'book.two.one', 3)
progressiveSet(k, 'book.dumbo.[].one', 3)
progressiveSet(k, 'book.dumbo.[].twenty', 434)
progressiveSet(k, 'book.dumbo.[].second', '3dqd25')
progressiveSet(k, 'book.dumbo.[1].leela', 'fry')
progressiveSet(k, 'book.dumbo.[@one=3].leela', 'fry')
console.log(JSON.stringify(k))
*/
function progressiveGet(object, queryPath) {
    var pathArray = queryPath.split(/\./).map(function (p) { return unshieldSeparator(p); });
    return pathArray.reduce(function (r, pathStep, i) {
        if (Array.isArray(r)) {
            return r.find(function (o) { return Object.values(o).includes(pathStep); });
        }
        if (!r)
            return NaN;
        return r[pathStep];
    }, object);
}
exports.progressiveGet = progressiveGet;
function progressiveSet(object, queryPath, value, summItUp) {
    var pathArray = queryPath.split(/\./).map(function (p) { return unshieldSeparator(p); });
    var property = pathArray.splice(-1);
    if (queryPath.startsWith("[") &&
        !Array.isArray(object) &&
        Object.keys(object).length === 0)
        object = [];
    var leaf = object;
    var pathHistory = [{ leaf: leaf, namedArrayIndex: null }];
    pathArray.forEach(function (pathStep, i) {
        var _a;
        var namedArrayIndex = null;
        if (pathStep.startsWith("[") && !Array.isArray(leaf)) {
            var key = pathStep.slice(1, pathStep.length - 1);
            if ((key !== 0 && !key) || Number.isInteger(+key)) {
                leaf["arr"] = [];
                leaf = leaf["arr"];
            }
            else if (key.startsWith("@")) {
                key = key.slice(1);
                var filterBy = key.split("=");
                if (!leaf[filterBy[0]])
                    leaf[filterBy[0]] = [];
                leaf = leaf[filterBy[0]];
            }
        }
        if (Array.isArray(leaf)) {
            var key = pathStep.slice(1, pathStep.length - 1);
            if (key !== 0 && !key) {
                leaf.push({});
                leaf = leaf[leaf.length - 1];
            }
            else if (Number.isInteger(+key)) {
                leaf = leaf[+key];
            }
            else if (key.startsWith("@")) {
                key = key.slice(1);
                var filterBy_1 = key.split("=");
                namedArrayIndex = filterBy_1;
                var found = leaf.find(function (a) { return a[filterBy_1[0]] == "" + filterBy_1[1]; });
                if (!!found) {
                    leaf = found;
                }
                else {
                    leaf.push((_a = {}, _a[filterBy_1[0]] = filterBy_1[1], _a));
                    leaf = leaf[leaf.length - 1];
                }
            }
        }
        else {
            var nextStep = pathArray[i + 1];
            if (!!nextStep &&
                nextStep.startsWith("[") &&
                nextStep.endsWith("]") &&
                !leaf[pathStep]) {
                leaf[pathStep] = [];
            }
            if (!leaf[pathStep])
                leaf[pathStep] = {}; //todo guess if there should be an array
            leaf = leaf[pathStep];
        }
        pathHistory = pathHistory.concat([{ leaf: leaf, namedArrayIndex: namedArrayIndex }]);
    });
    if (summItUp && !!leaf[property]) {
        leaf[property] += value;
    }
    else {
        leaf[property] = value;
    }
    if (value === undefined) {
        pathHistory.reverse();
        pathHistory.forEach(function (_a, i) {
            var step = _a.leaf, namedArrayIndex = _a.namedArrayIndex;
            if (Array.isArray(step)) {
                var spliceIndex = Object.values(step).findIndex(function (val, i) {
                    var previousStepNameddArrayIndex = pathHistory[i - 1] && pathHistory[i - 1].namedArrayIndex;
                    if (Array.isArray(val) &&
                        !val.reduce(function (r, v) { return r || v !== undefined; }, false))
                        return true;
                    if (!Object.keys(val).reduce(function (r, vk) {
                        return (r ||
                            (val[vk] !== undefined &&
                                (!previousStepNameddArrayIndex ||
                                    !(previousStepNameddArrayIndex[0] === vk &&
                                        previousStepNameddArrayIndex[1] == val[vk]))));
                    }, false))
                        return true;
                });
                if (!!~spliceIndex)
                    step.splice(spliceIndex, 1);
            }
            else {
                var spliceKey = Object.keys(step).find(function (val, i) {
                    if (!step[val])
                        return false;
                    if (namedArrayIndex &&
                        val == namedArrayIndex[0] &&
                        step[val] == namedArrayIndex[1])
                        return true;
                    if (Array.isArray(step[val]) &&
                        !step[val].reduce(function (r, v) { return r || v !== undefined; }, false))
                        return true;
                    if (!Object.values(step[val]).reduce(function (r, v) { return r || v !== undefined; }, false))
                        return true;
                });
                if (!!spliceKey)
                    delete step[spliceKey];
            }
        });
    }
    return object;
}
exports.progressiveSet = progressiveSet;
function iterateProgressive(obj, key, callback) {
    function iterateKeys(obj, keys, index, currentKeys) {
        if (index === void 0) { index = 0; }
        if (currentKeys === void 0) { currentKeys = []; }
        if (index === keys.length || obj == null) {
            callback(obj, currentKeys);
            return;
        }
        if (keys[index].startsWith(':')) {
            var objKeys = Object.keys(obj);
            objKeys.forEach(function (key) {
                iterateKeys(obj[key], keys, index + 1, __spreadArray(__spreadArray([], currentKeys), [key]));
            });
        }
        else if (keys[index] === '[]') {
            obj.forEach(function (el, i) {
                iterateKeys(el, keys, index + 1, __spreadArray(__spreadArray([], currentKeys), [i]));
            });
        }
        else {
            iterateKeys(obj[keys[index]], keys, index + 1, __spreadArray(__spreadArray([], currentKeys), [keys[index]]));
        }
    }
    return iterateKeys(obj, key.split('.'));
}
exports.iterateProgressive = iterateProgressive;
