import { Resource, filterByAccess } from "..";
import { Observable } from "./observable";
import { DynamicQuery } from "./dynamic-query";

export class DynamicSource extends Observable {
  constructor() {
    super();
  }

  invalidate(): void {
    this.notify(undefined);
  }

  close() {}
}

export class DynamicResource<
  Client,
  T,
  Q,
  A extends Record<string, (...args: any) => unknown>
> {
  constructor(private resource: Resource<Client, T, Q, A>) {}

  list(client: Client) {
    const compute = async () => {
      {
        const policy = this.resource.policy;
        const policyResult = await policy.access(client);
        if (policyResult.error || !policyResult.value)
          return { value: null, dependencies: policyResult.dependencies };
      }

      const fields = await filterByAccess(this.resource.fields, client);
      const queries = await filterByAccess(this.resource.queries, client);
      const actions = await filterByAccess(this.resource.actions, client);

      return {
        value: {
          fields: fields.value,
          queries: queries.value,
          actions: actions.value,
        },
        dependencies: [
          ...fields.dependencies,
          ...queries.dependencies,
          ...actions.dependencies,
        ],
      };
    };

    return new DynamicQuery(compute);
  }

  private fieldObservables: Record<any, DynamicSource> = {};
  field<Name extends keyof T>(name: Name) {
    return (this.fieldObservables[name] ??= new DynamicSource());
  }

  query<Name extends keyof Q>(client: Client, name: Name) {
    const compute = async () => {
      if (!(name in this.resource.queries))
        return { error: 404, dependencies: [] };

      {
        const policy = this.resource.policy;
        const policyResult = await policy.access(client);
        if (policyResult.error)
          return {
            error: policyResult.error,
            dependencies: policyResult.dependencies,
          };
        if (!policyResult.value)
          return { error: 404, dependencies: policyResult.dependencies };
      }

      {
        const policy = this.resource.queries[name].policy;
        const policyResult = await policy.access(client);
        if (policyResult.error)
          return {
            error: policyResult.error,
            dependencies: policyResult.dependencies,
          };
        if (!policyResult.value)
          return { error: 403, dependencies: policyResult.dependencies };
      }

      return await this.resource.queries[name].get();
    };

    return new DynamicQuery(compute);
  }

  async action<Name extends keyof A>(
    client: Client,
    name: Name,
    ...params: Parameters<A[Name]>
  ) {
    if (!(name in this.resource.actions[name])) throw 404;

    const action = this.resource.actions[name];
    if (!action.policy.access(client)) throw 403;

    const effects = await action.exec(...params);
    effects.forEach((source) => source.invalidate());
  }
}
