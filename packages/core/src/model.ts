import { Cascade, Volatile } from "@koreanwglasses/cascade";
import { Collection, Resource, Policy, ResourcePolicy, Client } from ".";
import {
  FuncRecord,
  Result,
  TypeAsValue,
  TypeFromValue,
  Whenever,
} from "./types";

/**
 * Fields form one of the foundations of mutable state. Queries
 * can declare a depency on a field, and actions can declare that
 * a field has changed, prompting the query to do a recalculation
 */
export interface Field<M extends Model, T> {
  type: TypeAsValue<T>;
  policy?: Policy<M>;
  /**
   * Include this field in a fetch. True by default
   */
  fetch?: boolean;
}

/**
 * Queries fetch data, and declare data or state they depend on,
 * and will update when any of those change. Queries can declare
 * dependencies on fields, so if a field changes, then the query
 * will re-compute, and send a new response if the output changes.
 *
 * Though both actions and queries can return data, the main
 * difference between the two is that actions declare effects
 * while queries declare dependencies
 */
export type Query<M extends Model, Params extends unknown[], T> =
  | {
      policy?: Policy<M, Params>;
      requireTarget?: false;
      /**
       * Include this query in a fetch. False by default
       */
      fetch?: boolean;
      get(
        this: Collection<M>,
        request: { target: Resource<M> | null; client: Client },
        ...params: Params
      ): QueryResult<T>;
    }
  | {
      policy?: ResourcePolicy<M, Params>;
      requireTarget: true;
      fetch?: boolean;
      get(
        this: Collection<M>,
        request: { target: Resource<M>; client: Client },
        ...params: Params
      ): QueryResult<T>;
    };

export type QueryResult<T> =
  | {
      value: T;
      deps: Volatile[];
    }
  | Result<T>;

/**
 * Executes an action and declares which data were affected to
 * queries dependent on them can update.
 *
 * Though both actions and queries can return data, the main
 * difference between the two is that actions declare effects
 * while queries declare dependencies
 */
export type Action<M extends Model, Params extends unknown[], T> =
  | {
      policy?: Policy<M, Params>;
      requireTarget?: false;
      exec(
        this: Collection<M>,
        request: { target: Resource<M> | null; client: Client },
        ...params: Params
      ): Whenever<ActionResult<T>>;
    }
  | {
      policy?: ResourcePolicy<M, Params>;
      requireTarget: true;
      exec(
        this: Collection<M>,
        request: { target: Resource<M>; client: Client },
        ...params: Params
      ): Whenever<ActionResult<T>>;
    };

export type ActionResult<T> =
  | {
      notify: Volatile[];
      response?: T;
    }
  | Result<T>;

/**
 * The model puts it all together, defining the fields (state), queries
 * (views), and actions (mutations) of a particular resource
 */
export interface Model<
  T = any,
  Q extends FuncRecord = any,
  A extends FuncRecord = any
> {
  name: string;

  fields?: { [K in keyof T]: Field<this, T[K]> };
  queries?: { [K in keyof Q]: Query<this, Parameters<Q[K]>, ReturnType<Q[K]>> };
  actions?: {
    [K in keyof A]: Action<this, Parameters<A[K]>, ReturnType<A[K]>>;
  };

  policy?: Policy<this>;
}

//////////////////
// HELPER TYPES //
//////////////////

export type Fields<M> = M extends Model<infer T>
  ? T
  : "fields" extends keyof M
  ? {
      [K in keyof M["fields"]]: M["fields"][K] extends { type: infer T }
        ? TypeFromValue<T>
        : never;
    }
  : {};

export type Queries<M> = M extends Model<any, infer Q>
  ? Q
  : "queries" extends keyof M
  ? {
      [K in keyof M["queries"]]: M["queries"][K] extends {
        get: (
          target: any,
          client: any,
          ...params: infer P
        ) => Cascade<infer R> | QueryResult<infer R>;
      }
        ? (...params: P) => R
        : never;
    }
  : {};

export type Actions<M> = M extends Model<any, any, infer A>
  ? A
  : "actions" extends keyof M
  ? {
      [K in keyof M["actions"]]: M["actions"][K] extends {
        exec: (
          target: any,
          client: any,
          ...params: infer P
        ) => ActionResult<infer T>;
      }
        ? (...params: P) => T
        : never;
    }
  : {};
