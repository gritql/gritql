import type { DocumentNode } from 'graphql';
import type { InferProps, ValidationMap } from 'prop-types';
import { Knex } from 'knex';
declare const defaultPropTypes: {
    sort_desc: any;
    sort_asc: any;
    limit: any;
    offset: any;
    type: any;
    from: any;
};
export declare const dimensionWrapper: <T = ValidationMap<any>>(dimension: (alias: string, args: import("prop-types").InferPropsInner<Pick<T, import("prop-types").RequiredKeys<T>>> & Partial<import("prop-types").InferPropsInner<Pick<T, Exclude<keyof T, import("prop-types").RequiredKeys<T>>>>> & import("prop-types").InferPropsInner<Pick<{
    sort_desc: any;
    sort_asc: any;
    limit: any;
    offset: any;
    type: any;
    from: any;
}, never>> & Partial<import("prop-types").InferPropsInner<Pick<{
    sort_desc: any;
    sort_asc: any;
    limit: any;
    offset: any;
    type: any;
    from: any;
}, "type" | "offset" | "from" | "limit" | "sort_desc" | "sort_asc">>>, query: any, knex: Knex, extras: {
    tree: DocumentNode;
}) => void, properties?: T, keywords?: string[], builder?: string) => (tree: DocumentNode, query: any, knex: Knex) => any;
export {};
