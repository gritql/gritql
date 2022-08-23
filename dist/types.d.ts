export declare const PropTypes: {
    array: any;
    bigint: any;
    bool: any;
    func: any;
    number: any;
    object: any;
    string: any;
    any: any;
    arrayOf: typeof createArrayOfTypeChecker;
    objectOf: typeof createObjectOfTypeChecker;
    oneOf: typeof createEnumTypeChecker;
    oneOfType: typeof createUnionTypeChecker;
    shape: typeof createShapeTypeChecker;
    exact: typeof createStrictShapeTypeChecker;
    tuple: typeof createTupleTypeChecker;
    map: typeof createMapTypeChecker;
};
declare function createArrayOfTypeChecker(typeChecker: any): any;
declare function createEnumTypeChecker(expectedValues: any): any;
declare function createObjectOfTypeChecker(typeChecker: any): any;
declare function createUnionTypeChecker(arrayOfTypeCheckers: any): any;
declare function createShapeTypeChecker(shapeTypes: any): any;
declare function createStrictShapeTypeChecker(shapeTypes: any): any;
declare function createMapTypeChecker(shapeTypes: any, keyTypeChecker: any, valueTypeChecker: any): any;
declare function createTupleTypeChecker(...types: any[]): any;
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
export declare function checkPropTypes(typeSpecs: any, values: any, location: any, componentName: any): void;
export {};
