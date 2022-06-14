"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.checkPropTypes = exports.PropTypes = void 0;
var has = Function.call.bind(Object.prototype.hasOwnProperty);
function emptyFunctionThatReturnsNull() {
    return null;
}
var ANONYMOUS = '<<anonymous>>';
exports.PropTypes = {
    array: createPrimitiveTypeChecker('array'),
    bigint: createPrimitiveTypeChecker('bigint'),
    bool: createPrimitiveTypeChecker('boolean'),
    func: createPrimitiveTypeChecker('function'),
    number: createPrimitiveTypeChecker('number'),
    object: createPrimitiveTypeChecker('object'),
    string: createPrimitiveTypeChecker('string'),
    any: createAnyTypeChecker(),
    arrayOf: createArrayOfTypeChecker,
    objectOf: createObjectOfTypeChecker,
    oneOf: createEnumTypeChecker,
    oneOfType: createUnionTypeChecker,
    shape: createShapeTypeChecker,
    exact: createStrictShapeTypeChecker
};
var PropTypeError = /** @class */ (function (_super) {
    __extends(PropTypeError, _super);
    function PropTypeError(message, data) {
        var _this = _super.call(this) || this;
        _this.message = message;
        _this.data = data && typeof data === 'object' ? data : {};
        _this.stack = '';
        return _this;
    }
    return PropTypeError;
}(Error));
function createChainableTypeChecker(validate) {
    function checkType(isRequired, props, propName, componentName, location, propFullName) {
        componentName = componentName || ANONYMOUS;
        propFullName = propFullName || propName;
        if (props[propName] == null) {
            if (isRequired) {
                if (props[propName] === null) {
                    return new PropTypeError('The ' +
                        location +
                        ' `' +
                        propFullName +
                        '` is marked as required ' +
                        ('in `' + componentName + '`, but its value is `null`.'));
                }
                return new PropTypeError('The ' +
                    location +
                    ' `' +
                    propFullName +
                    '` is marked as required in ' +
                    ('`' + componentName + '`, but its value is `undefined`.'));
            }
            return null;
        }
        else {
            return validate(props, propName, componentName, location, propFullName);
        }
    }
    var chainedCheckType = checkType.bind(null, false);
    chainedCheckType.isRequired = checkType.bind(null, true);
    return chainedCheckType;
}
function createPrimitiveTypeChecker(expectedType) {
    function validate(props, propName, componentName, location, propFullName) {
        var propValue = props[propName];
        var propType = getPropType(propValue);
        if (propType !== expectedType) {
            var preciseType = getPreciseType(propValue);
            return new PropTypeError('Invalid ' +
                location +
                ' `' +
                propFullName +
                '` of type ' +
                ('`' +
                    preciseType +
                    '` supplied to `' +
                    componentName +
                    '`, expected ') +
                ('`' + expectedType + '`.'), { expectedType: expectedType });
        }
        return null;
    }
    return createChainableTypeChecker(validate);
}
function createAnyTypeChecker() {
    return createChainableTypeChecker(emptyFunctionThatReturnsNull);
}
function createArrayOfTypeChecker(typeChecker) {
    function validate(props, propName, componentName, location, propFullName) {
        if (typeof typeChecker !== 'function') {
            return new PropTypeError('Property `' +
                propFullName +
                '` of component `' +
                componentName +
                '` has invalid PropType notation inside arrayOf.');
        }
        var propValue = props[propName];
        if (!Array.isArray(propValue)) {
            var propType = getPropType(propValue);
            return new PropTypeError('Invalid ' +
                location +
                ' `' +
                propFullName +
                '` of type ' +
                ('`' +
                    propType +
                    '` supplied to `' +
                    componentName +
                    '`, expected an array.'));
        }
        for (var i = 0; i < propValue.length; i++) {
            var error = typeChecker(propValue, i, componentName, location, propFullName + '[' + i + ']');
            if (error instanceof Error) {
                return error;
            }
        }
        return null;
    }
    return createChainableTypeChecker(validate);
}
function createEnumTypeChecker(expectedValues) {
    if (!Array.isArray(expectedValues)) {
        if (arguments.length > 1) {
            console.warn('Invalid arguments supplied to oneOf, expected an array, got ' +
                arguments.length +
                ' arguments. ' +
                'A common mistake is to write oneOf(x, y, z) instead of oneOf([x, y, z]).');
        }
        else {
            console.warn('Invalid argument supplied to oneOf, expected an array.');
        }
        return emptyFunctionThatReturnsNull;
    }
    function validate(props, propName, componentName, location, propFullName) {
        var propValue = props[propName];
        for (var i = 0; i < expectedValues.length; i++) {
            if (Object.is(propValue, expectedValues[i])) {
                return null;
            }
        }
        var valuesString = JSON.stringify(expectedValues, function replacer(key, value) {
            var type = getPreciseType(value);
            if (type === 'symbol') {
                return String(value);
            }
            return value;
        });
        return new PropTypeError('Invalid ' +
            location +
            ' `' +
            propFullName +
            '` of value `' +
            String(propValue) +
            '` ' +
            ('supplied to `' +
                componentName +
                '`, expected one of ' +
                valuesString +
                '.'));
    }
    return createChainableTypeChecker(validate);
}
function createObjectOfTypeChecker(typeChecker) {
    function validate(props, propName, componentName, location, propFullName) {
        if (typeof typeChecker !== 'function') {
            return new PropTypeError('Property `' +
                propFullName +
                '` of component `' +
                componentName +
                '` has invalid PropType notation inside objectOf.');
        }
        var propValue = props[propName];
        var propType = getPropType(propValue);
        if (propType !== 'object') {
            return new PropTypeError('Invalid ' +
                location +
                ' `' +
                propFullName +
                '` of type ' +
                ('`' +
                    propType +
                    '` supplied to `' +
                    componentName +
                    '`, expected an object.'));
        }
        for (var key in propValue) {
            if (has(propValue, key)) {
                var error = typeChecker(propValue, key, componentName, location, propFullName + '.' + key);
                if (error instanceof Error) {
                    return error;
                }
            }
        }
        return null;
    }
    return createChainableTypeChecker(validate);
}
function createUnionTypeChecker(arrayOfTypeCheckers) {
    if (!Array.isArray(arrayOfTypeCheckers)) {
        console.warn('Invalid argument supplied to oneOfType, expected an instance of array.');
        return emptyFunctionThatReturnsNull;
    }
    for (var i = 0; i < arrayOfTypeCheckers.length; i++) {
        var checker = arrayOfTypeCheckers[i];
        if (typeof checker !== 'function') {
            console.warn('Invalid argument supplied to oneOfType. Expected an array of check functions, but ' +
                'received ' +
                getPostfixForTypeWarning(checker) +
                ' at index ' +
                i +
                '.');
            return emptyFunctionThatReturnsNull;
        }
    }
    function validate(props, propName, componentName, location, propFullName) {
        var expectedTypes = [];
        for (var i = 0; i < arrayOfTypeCheckers.length; i++) {
            var checker = arrayOfTypeCheckers[i];
            var checkerResult = checker(props, propName, componentName, location, propFullName);
            if (checkerResult == null) {
                return null;
            }
            if (checkerResult.data && has(checkerResult.data, 'expectedType')) {
                expectedTypes.push(checkerResult.data.expectedType);
            }
        }
        var expectedTypesMessage = expectedTypes.length > 0
            ? ', expected one of type [' + expectedTypes.join(', ') + ']'
            : '';
        return new PropTypeError('Invalid ' +
            location +
            ' `' +
            propFullName +
            '` supplied to ' +
            ('`' + componentName + '`' + expectedTypesMessage + '.'));
    }
    return createChainableTypeChecker(validate);
}
function invalidValidatorError(componentName, location, propFullName, key, type) {
    return new PropTypeError(componentName +
        ': ' +
        location +
        ' type `' +
        propFullName +
        '.' +
        key +
        '` is invalid; ' +
        'it must be a function, usually from the `prop-types` package, but received `' +
        type +
        '`.');
}
function createShapeTypeChecker(shapeTypes) {
    function validate(props, propName, componentName, location, propFullName) {
        var propValue = props[propName];
        var propType = getPropType(propValue);
        if (propType !== 'object') {
            return new PropTypeError('Invalid ' +
                location +
                ' `' +
                propFullName +
                '` of type `' +
                propType +
                '` ' +
                ('supplied to `' + componentName + '`, expected `object`.'));
        }
        for (var key in shapeTypes) {
            var checker = shapeTypes[key];
            if (typeof checker !== 'function') {
                return invalidValidatorError(componentName, location, propFullName, key, getPreciseType(checker));
            }
            var error = checker(propValue, key, componentName, location, propFullName + '.' + key);
            if (error) {
                return error;
            }
        }
        return null;
    }
    return createChainableTypeChecker(validate);
}
function createStrictShapeTypeChecker(shapeTypes) {
    function validate(props, propName, componentName, location, propFullName) {
        var propValue = props[propName];
        var propType = getPropType(propValue);
        if (propType !== 'object') {
            return new PropTypeError('Invalid ' +
                location +
                ' `' +
                propFullName +
                '` of type `' +
                propType +
                '` ' +
                ('supplied to `' + componentName + '`, expected `object`.'));
        }
        var allKeys = __assign(__assign({}, props[propName]), shapeTypes);
        for (var key in allKeys) {
            var checker = shapeTypes[key];
            if (has(shapeTypes, key) && typeof checker !== 'function') {
                return invalidValidatorError(componentName, location, propFullName, key, getPreciseType(checker));
            }
            if (!checker) {
                return new PropTypeError('Invalid ' +
                    location +
                    ' `' +
                    propFullName +
                    '` key `' +
                    key +
                    '` supplied to `' +
                    componentName +
                    '`.' +
                    '\nBad object: ' +
                    JSON.stringify(props[propName], null, '  ') +
                    '\nValid keys: ' +
                    JSON.stringify(Object.keys(shapeTypes), null, '  '));
            }
            var error = checker(propValue, key, componentName, location, propFullName + '.' + key);
            if (error) {
                return error;
            }
        }
        return null;
    }
    return createChainableTypeChecker(validate);
}
function getPropType(propValue) {
    var propType = typeof propValue;
    if (Array.isArray(propValue)) {
        return 'array';
    }
    if (propValue instanceof RegExp) {
        return 'object';
    }
    return propType;
}
function getPreciseType(propValue) {
    if (typeof propValue === 'undefined' || propValue === null) {
        return '' + propValue;
    }
    var propType = getPropType(propValue);
    if (propType === 'object') {
        if (propValue instanceof Date) {
            return 'date';
        }
        else if (propValue instanceof RegExp) {
            return 'regexp';
        }
    }
    return propType;
}
function getPostfixForTypeWarning(value) {
    var type = getPreciseType(value);
    switch (type) {
        case 'array':
        case 'object':
            return 'an ' + type;
        case 'boolean':
        case 'date':
        case 'regexp':
            return 'a ' + type;
        default:
            return type;
    }
}
/**
 * Assert that the values match with the type specs.
 * Error messages are memorized and will only be shown once.
 *
 * @param {object} typeSpecs Map of name to a PropType
 * @param {object} values Runtime values that need to be type-checked
 * @param {string} location e.g. "prop", "context", "child context"
 * @param {string} componentName Name of the component for error messages.
 * @private
 */
function checkPropTypes(typeSpecs, values, location, componentName) {
    for (var typeSpecName in typeSpecs) {
        if (has(typeSpecs, typeSpecName)) {
            var error = void 0;
            try {
                if (typeof typeSpecs[typeSpecName] !== 'function') {
                    var err = Error(componentName +
                        ': ' +
                        location +
                        ' type `' +
                        typeSpecName +
                        '` is invalid; ' +
                        'it must be a function, but received `' +
                        typeof typeSpecs[typeSpecName] +
                        '`.' +
                        'This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.');
                    err.name = 'Invariant Violation';
                    throw err;
                }
                error = typeSpecs[typeSpecName](values, typeSpecName, componentName, location, null);
            }
            catch (ex) {
                error = ex;
            }
            if (error && !(error instanceof Error)) {
                throw new Error(componentName +
                    ': type specification of ' +
                    location +
                    ' `' +
                    typeSpecName +
                    '` is invalid; the type checker ' +
                    'function must return `null` or an `Error` but returned a ' +
                    typeof error +
                    '. ' +
                    'You may have forgotten to pass an argument to the type checker ' +
                    'creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and ' +
                    'shape all require an argument).');
            }
            if (error instanceof Error) {
                throw new Error('Failed ' + location + ' type: ' + error.message);
            }
        }
    }
}
exports.checkPropTypes = checkPropTypes;
