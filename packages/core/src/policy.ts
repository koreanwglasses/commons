// Policies mediate how clients can access a resource.
// Based on the current application state and client details,
// the policy will determine what data and actions are avail-
// able to that client.
//
// Policies can change dynamically as the system state
// changes, allowing the client to access data they could not
// before, or perform actions they could not before. This is
// useful in a context like Discord where users are
// dynamically given privileges, or in turn-based games where
// the access to a resource will change based on other
// player's actions. If this happens, the client will be
// notified by default.
//
// The policy should be deterministic. The policy should not
// rely on any external state. Instead, another process should
// update some resource, and the policy can depend on the
// state/data of that resource. This ensures that access
// changing updates can be tracked. Alternatively, an
// ExternalResource can be declared as a dependency
//

import { Cascade } from "@koreanwglasses/cascade";
import { Model, Collection, Resource } from ".";
import { Result } from "./types";

export interface Client {}

export const ACCESS_NEVER = "never";
export const ACCESS_DENY = "deny";
export const ACCESS_ALLOW = "allow";
export type AccessType =
  | typeof ACCESS_NEVER
  | typeof ACCESS_DENY
  | typeof ACCESS_ALLOW;

export type Policy<M extends Model, Params extends unknown[] = []> = (
  this: Collection<M>,
  target: Resource<M> | null,
  client: Client,
  ...params: Params
) => Result<AccessType>;

export type ResourcePolicy<M extends Model, Params extends unknown[] = []> = (
  this: Collection<M>,
  target: Resource<M>,
  client: Client,
  ...params: Params
) => Result<AccessType>;

/**
 * Can only be read/executed internally
 */
export const ALLOW_NONE = () => Cascade.const("never" as AccessType);

/**
 * Can be read/executed by anyone
 */
export const ALLOW_ALL = () => Cascade.const("allow" as AccessType);
