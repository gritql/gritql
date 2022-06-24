export declare type Model = {
    [key: string]: unknown;
};
export declare type Filter = {
    [Property in Join<NestedPaths<Model>, '.'>]?: Condition<PropertyType<Model, Property>>;
} & RootFilterOperators;
export declare type Join<T extends unknown[], D extends string> = T extends [] ? '' : T extends [string | number] ? `${T[0]}` : T extends [string | number, ...infer R] ? `${T[0]}${D}${Join<R, D>}` : string;
export declare type NestedPaths<Type> = Type extends string | number | boolean ? [] : Type extends ReadonlyArray<infer ArrayType> ? [number, ...NestedPaths<ArrayType>] : Type extends Map<string, any> ? [string] : Type extends object ? {
    [Key in Extract<keyof Type, string>]: [Key, ...NestedPaths<Type[Key]>];
}[Extract<keyof Type, string>] : [];
export declare type PropertyType<Type, Property extends string> = string extends Property ? unknown : Property extends keyof Type ? Type[Property] : Property extends `${number}` ? Type extends ReadonlyArray<infer ArrayType> ? ArrayType : unknown : Property extends `${infer Key}.${infer Rest}` ? Key extends `${number}` ? Type extends ReadonlyArray<infer ArrayType> ? PropertyType<ArrayType, Rest> : unknown : Key extends keyof Type ? Type[Key] extends Map<string, infer MapType> ? MapType : PropertyType<Type[Key], Rest> : unknown : unknown;
export interface RootFilterOperators extends Model {
    and?: Filter[];
    nor?: Filter[];
    or?: Filter[];
    not?: Filter[];
    search?: Filter & {
        language?: string;
    };
}
export declare type EnhancedOmit<TRecordOrUnion, KeyUnion> = string extends keyof TRecordOrUnion ? TRecordOrUnion : TRecordOrUnion extends any ? Pick<TRecordOrUnion, Exclude<keyof TRecordOrUnion, KeyUnion>> : never;
export declare type Condition<T> = AlternativeType<T> | FilterOperators<AlternativeType<T>>;
export declare type AlternativeType<T> = T extends ReadonlyArray<infer U> ? T | RegExpOrString<U> : RegExpOrString<T>;
export declare type RegExpOrString<T> = T extends string ? RegExp | T : T;
export interface FilterOperators<TValue = unknown> extends Model {
    eq?: TValue;
    gt?: TValue;
    gte?: TValue;
    in?: ReadonlyArray<TValue>;
    lt?: TValue;
    lte?: TValue;
    ne?: TValue;
    nin?: ReadonlyArray<TValue>;
    regex?: TValue;
    from?: string;
    inherited?: boolean;
}
