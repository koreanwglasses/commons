// Policies mediate how clients can access a shared resource.
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

import { Result, Observable } from "..";
import { Whenever } from "../types";

export interface Policy<Client> {
  access(client: Client): Whenever<Result<Boolean>>;
}

export const filterByAccess = async <
  T extends Record<any, { policy: Policy<Client> }>,
  Client
>(
  target: T,
  client: Client
) =>
  (
    await Promise.all(
      Object.entries(target).map(async ([name, { policy }]) => {
        const policyResult = await policy.access(client);
        return {
          value: !policyResult.error && policyResult.value ? name : null,
          dependencies: policyResult.dependencies,
        };
      })
    )
  ).reduce(
    (a, b) => {
      if (b.value) a.value.push(b.value);
      a.dependencies.push(...b.dependencies);
      return a;
    },
    { value: [] as (keyof T)[], dependencies: [] as Observable[] }
  );

/**
 * Can only be read/executed internally
 */
export const ALLOW_NONE: Policy<unknown> = {
  access: () => ({ value: false, dependencies: [] }),
};

/**
 * Can be read/executed by anyone
 */
export const ALLOW_ALL: Policy<unknown> = {
  access: () => ({ value: true, dependencies: [] }),
};
