"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPropTypes = exports.PropTypes = void 0;
const has = Function.call.bind(Object.prototype.hasOwnProperty);
function emptyFunctionThatReturnsNull() {
    return null;
}
const ANONYMOUS = '<<anonymous>>';
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
    exact: createStrictShapeTypeChecker,
};
class PropTypeError extends Error {
    constructor(message, data) {
        super();
        this.message = message;
        this.data = data && typeof data === 'object' ? data : {};
        this.stack = '';
    }
}
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
    const chainedCheckType = checkType.bind(null, false);
    chainedCheckType.isRequired = checkType.bind(null, true);
    return chainedCheckType;
}
function createPrimitiveTypeChecker(expectedType) {
    function validate(props, propName, componentName, location, propFullName) {
        const propValue = props[propName];
        const propType = getPropType(propValue);
        if (propType !== expectedType) {
            const preciseType = getPreciseType(propValue);
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
        const propValue = props[propName];
        if (!Array.isArray(propValue)) {
            const propType = getPropType(propValue);
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
        for (let i = 0; i < propValue.length; i++) {
            const error = typeChecker(propValue, i, componentName, location, propFullName + '[' + i + ']');
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
        const propValue = props[propName];
        for (let i = 0; i < expectedValues.length; i++) {
            if (Object.is(propValue, expectedValues[i])) {
                return null;
            }
        }
        const valuesString = JSON.stringify(expectedValues, function replacer(key, value) {
            const type = getPreciseType(value);
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
        const propValue = props[propName];
        const propType = getPropType(propValue);
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
        for (const key in propValue) {
            if (has(propValue, key)) {
                const error = typeChecker(propValue, key, componentName, location, propFullName + '.' + key);
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
    for (let i = 0; i < arrayOfTypeCheckers.length; i++) {
        const checker = arrayOfTypeCheckers[i];
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
        const expectedTypes = [];
        for (let i = 0; i < arrayOfTypeCheckers.length; i++) {
            const checker = arrayOfTypeCheckers[i];
            const checkerResult = checker(props, propName, componentName, location, propFullName);
            if (checkerResult == null) {
                return null;
            }
            if (checkerResult.data && has(checkerResult.data, 'expectedType')) {
                expectedTypes.push(checkerResult.data.expectedType);
            }
        }
        const expectedTypesMessage = expectedTypes.length > 0
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
        const propValue = props[propName];
        const propType = getPropType(propValue);
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
        for (const key in shapeTypes) {
            const checker = shapeTypes[key];
            if (typeof checker !== 'function') {
                return invalidValidatorError(componentName, location, propFullName, key, getPreciseType(checker));
            }
            const error = checker(propValue, key, componentName, location, propFullName + '.' + key);
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
        const propValue = props[propName];
        const propType = getPropType(propValue);
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
        const allKeys = { ...props[propName], ...shapeTypes };
        for (const key in allKeys) {
            const checker = shapeTypes[key];
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
            const error = checker(propValue, key, componentName, location, propFullName + '.' + key);
            if (error) {
                return error;
            }
        }
        return null;
    }
    return createChainableTypeChecker(validate);
}
function getPropType(propValue) {
    const propType = typeof propValue;
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
    const propType = getPropType(propValue);
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
    const type = getPreciseType(value);
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
    for (const typeSpecName in typeSpecs) {
        if (has(typeSpecs, typeSpecName)) {
            let error;
            try {
                if (typeof typeSpecs[typeSpecName] !== 'function') {
                    const err = Error(componentName +
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
