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
var __spreadArray = (this && this.__spreadArray) || function (to, from) {
    for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
        to[j] = from[i];
    return to;
};
exports.__esModule = true;
exports.getBatchContext = exports.replVars = exports.iterateProgressive = exports.progressiveSet = exports.progressiveGet = void 0;
function unshieldSeparator(str) {
    if (typeof str !== 'string')
        return str;
    return str.replace(/\$#@#/, '.');
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
function progressiveGet(object, queryPath, hashContext) {
    if (hashContext === void 0) { hashContext = {}; }
    var pathArray = queryPath.split(/\./).map(function (p) { return unshieldSeparator(p); });
    return pathArray.reduce(function (r, pathStep, i) {
        var _a, _b, _c, _d;
        if (pathStep.startsWith('[') && pathStep.endsWith(']')) {
            var path = pathStep.slice(0, -1).slice(2);
            var separatorIndex = path.indexOf('=');
            var _e = [
                path.slice(0, separatorIndex),
                path.slice(separatorIndex + 1),
            ], step_1 = _e[0], value_1 = _e[1];
            var indexStep = "$" + step_1;
            if (Array.isArray(r)) {
                // Fast indexing
                var index = (_b = (_a = hashContext === null || hashContext === void 0 ? void 0 : hashContext["$" + step_1]) === null || _a === void 0 ? void 0 : _a[value_1]) === null || _b === void 0 ? void 0 : _b.index;
                if (index != null) {
                    hashContext = hashContext[indexStep][value_1];
                    return r[index];
                }
                index = r.findIndex(function (o) { return o[step_1] == value_1; });
                if (index !== -1) {
                    hashContext[indexStep] = hashContext[indexStep] || {
                        $prevHashContext: hashContext
                    };
                    hashContext[indexStep][value_1] = __assign(__assign({ $prevHashContext: hashContext[indexStep] }, hashContext[indexStep][value_1]), { index: index });
                    hashContext = hashContext[indexStep][value_1];
                    return r[index];
                }
                else {
                    return NaN;
                }
            }
            else if (Array.isArray(r[step_1])) {
                // Fast indexing
                var index = (_d = (_c = hashContext === null || hashContext === void 0 ? void 0 : hashContext[indexStep]) === null || _c === void 0 ? void 0 : _c[value_1]) === null || _d === void 0 ? void 0 : _d.index;
                if (index != null) {
                    hashContext = hashContext[indexStep];
                    return r[step_1][index];
                }
                index = r[step_1].findIndex(function (o) { return o[step_1] == value_1; });
                if (index !== -1) {
                    hashContext[indexStep] = hashContext[indexStep] || {
                        $prevHashContext: hashContext
                    };
                    hashContext[indexStep][value_1] = __assign(__assign({ $prevHashContext: hashContext[indexStep] }, hashContext[indexStep][value_1]), { index: index });
                    hashContext = hashContext[indexStep][value_1];
                    return r[step_1][index];
                }
                else {
                    return NaN;
                }
            }
            else if (r[pathStep]) {
                hashContext["$" + pathStep] = hashContext["$" + pathStep] || {
                    $prevHashContext: hashContext
                };
                hashContext = hashContext["$" + pathStep];
                return r[pathStep];
            }
            else {
                return NaN;
            }
        }
        if (Array.isArray(r)) {
            return r.find(function (o) { return Object.values(o).includes(pathStep); });
        }
        if (r == undefined)
            return NaN;
        hashContext["$" + pathStep] = hashContext["$" + pathStep] || {
            $prevHashContext: hashContext
        };
        hashContext = hashContext["$" + pathStep];
        return r[pathStep];
    }, object);
}
exports.progressiveGet = progressiveGet;
function progressiveSet(object, queryPath, value, summItUp, hashContext) {
    if (hashContext === void 0) { hashContext = {}; }
    var pathArray = queryPath.split(/\./).map(function (p) { return unshieldSeparator(p); });
    var property = pathArray.splice(-1);
    if (queryPath.startsWith('[') &&
        !Array.isArray(object) &&
        Object.keys(object).length === 0)
        object = [];
    var leaf = object;
    var pathHistory = [{ leaf: leaf, namedArrayIndex: null }];
    pathArray.forEach(function (pathStep, i) {
        var _a;
        var _b, _c, _d;
        var namedArrayIndex = null;
        if (pathStep.startsWith('[') && !Array.isArray(leaf)) {
            var key = pathStep.slice(1, pathStep.length - 1);
            if ((key !== 0 && !key) || Number.isInteger(+key)) {
                leaf['arr'] = [];
                leaf = leaf['arr'];
            }
            else if (key.startsWith('@')) {
                key = key.slice(1);
                var filterBy = key.split('=');
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
            else if (key.startsWith('@')) {
                key = key.slice(1);
                var filterBy_1 = key.split('=');
                namedArrayIndex = filterBy_1;
                var indexStep = "$" + filterBy_1[0];
                // Fast indexing
                var firstIndexInput = !hashContext[indexStep];
                hashContext[indexStep] = hashContext[indexStep] || {
                    $prevHashContext: hashContext
                };
                var found = void 0;
                var index = (_c = (_b = hashContext[indexStep]) === null || _b === void 0 ? void 0 : _b[filterBy_1[1]]) === null || _c === void 0 ? void 0 : _c.index;
                if (index != null) {
                    found = (_d = leaf[index]) !== null && _d !== void 0 ? _d : null;
                }
                if (found == null && firstIndexInput) {
                    var foundIndex = leaf.findIndex(function (a) { return a[filterBy_1[0]] == '' + filterBy_1[1]; });
                    if (foundIndex !== -1) {
                        hashContext[indexStep][filterBy_1[1]] = __assign(__assign({ $prevHashContext: hashContext[indexStep] }, hashContext[indexStep][filterBy_1[1]]), { index: foundIndex });
                        found = leaf[foundIndex];
                    }
                }
                if (!!found) {
                    leaf = found;
                    hashContext = hashContext[indexStep][filterBy_1[1]];
                }
                else {
                    leaf.push((_a = {}, _a[filterBy_1[0]] = filterBy_1[1], _a));
                    hashContext[indexStep][filterBy_1[1]] = __assign(__assign({ $prevHashContext: hashContext[indexStep] }, hashContext[indexStep][filterBy_1[1]]), { index: leaf.length - 1 });
                    hashContext = hashContext[indexStep][filterBy_1[1]];
                    leaf = leaf[leaf.length - 1];
                }
            }
        }
        else {
            var nextStep = pathArray[i + 1];
            if (!!nextStep &&
                nextStep.startsWith('[') &&
                nextStep.endsWith(']') &&
                !leaf[pathStep]) {
                leaf[pathStep] = [];
            }
            if (!leaf[pathStep])
                leaf[pathStep] = {}; //todo guess if there should be an array
            hashContext["" + pathStep] = hashContext["" + pathStep] || {
                $prevHashContext: hashContext
            };
            hashContext = hashContext["" + pathStep];
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
        pathHistory.forEach(function (_a) {
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
                if (!!~spliceIndex) {
                    delete hashContext["$" + namedArrayIndex[0]][step[spliceIndex]];
                    step.splice(spliceIndex, 1);
                }
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
                if (!!spliceKey) {
                    if (hashContext.$prevHashContext[spliceKey] === hashContext) {
                        delete hashContext.$prevHashContext[spliceKey];
                    }
                    delete step[spliceKey];
                }
            }
            if (hashContext.$prevHashContext) {
                hashContext = hashContext.$prevHashContext;
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
        else if (keys[index].startsWith('[') && keys[index].endsWith(']')) {
            obj.forEach(function (el, i) {
                iterateKeys(el, keys, index + 1, __spreadArray(__spreadArray([], currentKeys), [i]));
            });
        }
        else {
            iterateKeys(obj[keys[index]], keys, index + 1, __spreadArray(__spreadArray([], currentKeys), [
                keys[index],
            ]));
        }
    }
    return iterateKeys(obj, key.split('.'));
}
exports.iterateProgressive = iterateProgressive;
function shieldSeparator(str) {
    if (typeof str !== 'string')
        return str;
    return str.replace(/\./g, '$#@#');
}
function replVars(str, obj) {
    var keys = Object.keys(obj);
    for (var key in keys) {
        str = str.replace(":" + keys[key], shieldSeparator(obj[keys[key]]));
    }
    return str;
}
exports.replVars = replVars;
function getBatchContext(batches, by) {
    var _a, _b;
    return (((_b = (_a = (batches[by] || batches['___query' + by])) === null || _a === void 0 ? void 0 : _a.find(function (q) { return q.name === by; })) === null || _b === void 0 ? void 0 : _b.hashContext) || {});
}
exports.getBatchContext = getBatchContext;
