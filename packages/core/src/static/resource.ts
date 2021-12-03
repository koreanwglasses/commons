// The core of the commons framework: the shared resource
//
// Resources consist of two parts: data, and actions.
//
// For the data, think models or schemas in database terms.
// A resource definition will contain all the data for a
// particular resource, for exmaple, including private user
// data for a user resource.
//
// Actions are routines that describe how the data can be
// modified. These represent endpoints called directly by the
// client.
//
// Resources can be read and modified by clients, mediated by
// policies (see /src/policies.ts) that determine the
// available data and actions based on the requesting client
// and the application state (maintained server side).
//
// By default, clients that request a resource will be
// subscribed to any changes they can see (i.e., only to
// fields they have access to, if the client does not have
// access to the full resource). The client will be notified
// whenever the data changes (e.g. by an external action).
// The client will also be notified if policy/state changes
// expand the client's access to a resource, either with new
// data or actions, so they can update their interface
// accordingly.
//
// Resources can also be nested, which are not subscribed to
// by default.
//

import { Policy, Result, DynamicSource } from "..";
import { Whenever } from "../types";

export type TypeAsValue<T> = T extends string
  ? String
  : T extends number
  ? Number
  : T extends boolean
  ? Boolean
  : T extends object
  ? { [K in keyof T]: TypeAsValue<T[K]> }
  : T;

export interface Field<Client, T> {
  type: TypeAsValue<T>;
  policy: Policy<Client>;
}



export interface Query<Client, T> {
  policy: Policy<Client>;
  get(): Whenever<Result<T>>;
}

/**
 * Should return a list of Data nodes that were updated or
 * modified by this action, so that the appropriate
 * subscribers can be notified.
 *
 * Action results will not be subscribed to, and thus should
 * not be used to fetch data. Ideally, the application should
 * not depend on the return value of an action.
 */
export interface Action<Client, Params extends unknown[]> {
  policy: Policy<Client>;
  exec(...params: Params): Whenever<DynamicSource[]>
}

export interface Resource<
  Client,
  T,
  Q,
  A extends Record<string, (...args: any) => unknown>
> {
  policy: Policy<Client>;

  fields: { [K in keyof T]: Field<Client, T[K]> };
  queries: { [K in keyof Q]: Query<Client, Q[K]> };
  actions: { [K in keyof A]: Action<Client, Parameters<A[K]>> };
}
