declare module "gql-json-slicer" {
  export function gqlBuild(query: string): any;
  export function merge(definition: any, result: Array): any;
}
