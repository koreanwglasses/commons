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

import { Resource } from "./resource";

export interface Policy<R extends Resource> {

}