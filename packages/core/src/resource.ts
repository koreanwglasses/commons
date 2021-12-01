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

export interface Resource {
  
}