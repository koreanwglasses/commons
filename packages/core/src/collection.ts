import { Cascade, Volatile } from "@koreanwglasses/cascade";
import {
  Actions,
  Model,
  Fields,
  Policy,
  Client,
  Queries,
  ACCESS_NEVER,
  ACCESS_DENY,
  AccessType,
  ResourcePolicy,
  ACCESS_ALLOW,
} from ".";
import { Store } from "./database";
import { Whenever } from "./types";

export const FORBIDDEN = 403;
export const NOT_FOUND = 404;

const throwPolicy = (access: AccessType) => {
  if (access === ACCESS_NEVER) throw NOT_FOUND;
  if (access === ACCESS_DENY) throw FORBIDDEN;
};

export type HandleName<M> =
  | {
      [K in keyof Fields<M>]: K extends string | number ? `.${K}` : never;
    }[keyof Fields<M>]
  | {
      [K in keyof Queries<M>]: K extends string | number ? `/${K}?` : never;
    }[keyof Queries<M>];

export class Collection<M extends Model> {
  /** @internal */
  _handles: Record<any, Volatile> = {};

  /** @internal */
  _handle(key: string) {
    let handle = this._handles[key];
    if (handle) return handle;

    handle = this._handles[key] = Cascade.trigger();
    handle.onClose(() => delete this._handles[key]);

    return handle;
  }

  /** @internal */
  _existenceHandle(id: string) {
    return this._handle(`${id}:`);
  }

  /** @internal */
  _checkExistence(id: string): Cascade<void> {
    const handle = this._existenceHandle(id);
    return handle.p(async () => {
      const item = await (await this.store).findById(id, []);
      if (!item) throw NOT_FOUND;
    });
  }

  /** @internal */
  _checkCollectionPolicy(
    client: Client | Collection<any>,
    id: string | null
  ): Cascade<Resource<M> | null> {
    return Cascade.flatten(
      id ? this._checkExistence(id).p(() => this.resource(id)) : null
    ).j(async (target) =>
      client instanceof Collection
        ? Cascade.const(target) // Skip policy check if internal
        : Cascade.flatten(
            (await this.model.policy?.call(this, target, client)) ??
              ACCESS_ALLOW
          )
            .p(throwPolicy)
            .p(() => target)
    );
  }

  /** @internal */
  _checkPolicies(
    policy: Policy<M> | ResourcePolicy<M> | undefined,
    client: Client | Collection<any>,
    id: string | null,
    params: unknown[] = []
  ): Cascade<Resource<M> | null> {
    return this._checkCollectionPolicy(client, id).j(async (target) =>
      client instanceof Collection
        ? Cascade.const(target) // Skip policy check if internal
        : Cascade.flatten(
            (await policy?.apply(this, [target, client, ...params] as any)) ??
              ACCESS_NEVER
          )
            .p(throwPolicy)
            .p(() => target)
    );
  }

  /** @internal */
  _allowedKeys(
    client: Client,
    id: string | null,
    map: Record<string, { policy?: Policy<M> | ResourcePolicy<M> }>
  ): Cascade<string[]> {
    return Cascade.all(
      Object.entries(map).map(([name, aspect]) =>
        this._checkPolicies(aspect.policy, client, id)
          .p(() => name)
          .catch(() => undefined)
      )
    ).p((names) => names.filter((name) => name)) as Cascade<string[]>;
  }

  /** @internal */
  _fieldHandle(id: string, name: keyof Fields<M>) {
    return this._handle(`${id}:.${name}`);
  }

  /** @internal */
  _field<Name extends keyof Fields<M> & string>(
    client: Client | Collection<any>,
    id: string,
    name: Name
  ): Cascade<Fields<M>[Name]> {
    const { fields } = this.model;
    const field = fields?.[name];

    if (!field) return Cascade.error(NOT_FOUND);

    const handle = this._fieldHandle(id, name);

    return this._checkPolicies(field.policy, client, id).j(() =>
      handle.p(
        async () => (await (await this.store).findById(id, [name]))?.[name]
      )
    );
  }

  /** @internal */
  _fetch(
    client: Client | Collection<any>,
    id: string,
    includeQueries = false
  ): Cascade<
    Partial<Fields<M>> &
      Partial<{ [K in keyof Queries<M>]: ReturnType<Queries<M>[K]> }>
  > {
    const { fields, queries } = this.model;

    const fieldsToFetch = Object.fromEntries(
      Object.entries(fields ?? {}).filter(([_, v]) => v.fetch ?? true)
    );

    const queriesToFetch = includeQueries
      ? Object.fromEntries(
          Object.entries(queries ?? {}).filter(([_, v]) => v.fetch ?? false)
        )
      : {};

    return this._checkCollectionPolicy(client, id).j(() => {
      const base = this._allowedKeys(client, id, fieldsToFetch).j((allowed) => {
        const handles = allowed.map((name) =>
          this._fieldHandle(id, name as keyof Fields<M>)
        );
        return new Cascade(async (_, deps) => {
          deps(...handles);
          const item = await (await this.store).findById(id, allowed);
          if (!item) throw NOT_FOUND;
          return item;
        });
      });

      const queryResults = Cascade.all(
        Object.keys(queriesToFetch).map((name) =>
          this._query(client, id, name, ...([] as any))
            .p((result) => [name, result] as const)
            .catch(() => undefined)
        )
      ).p((entries) =>
        Object.fromEntries(
          entries.filter((entry) => entry) as [
            string,
            ReturnType<Queries<M>[string]>
          ][]
        )
      );

      return Cascade.all([base, queryResults] as const).p(
        ([base, queryResults]) => ({
          ...base,
          ...queryResults,
        })
      );
    });
  }

  /** @internal */
  _queryHandle(id: string | null, name: keyof Fields<M>) {
    return this._handle(`${id || "*"}:/${name}?`);
  }

  /** @internal */
  _query<Name extends keyof Queries<M>>(
    client: Client | Collection<any>,
    id: string | null,
    name: Name,
    ...params: Parameters<Queries<M>[Name]>
  ): Cascade<ReturnType<Queries<M>[Name]>> {
    const { queries } = this.model;
    const query = queries?.[name];

    if (!query || (query.requireTarget && !id)) return Cascade.error(NOT_FOUND);

    const handle = this._queryHandle(id, name);

    return this._checkPolicies(query.policy, client, id, params).j((target) =>
      handle
        .p(async (_, deps) => {
          const result = await query!.get.call(
            this,
            { target: target!, client },
            ...params
          );

          if (
            result &&
            typeof result === "object" &&
            Array.isArray(result.deps) &&
            "value" in result
          ) {
            /* Validate the return from the query call */
            const keys = Object.keys(result);
            if (keys.length > 2) {
              console.warn(
                "Query returned an object with a `value` field and a `deps` array but also contains other fields. This potentially indicates a bug. Check the ActionResult type for reference."
              );
            }

            /* Set dependencies and return value */
            deps(...(result.deps ?? []));
            return result.value;
          } else {
            return result;
          }
        })
        .flat()
    );
  }

  /** @internal */
  async _action<Name extends keyof Actions<M>>(
    client: Client | Collection<any>,
    id: string | null,
    name: Name,
    ...params: Parameters<Actions<M>[Name]>
  ): Promise<ReturnType<Actions<M>[Name]>> {
    const { actions } = this.model;
    const action = actions?.[name];

    if (!action || (action.requireTarget && !id)) throw NOT_FOUND;

    const target = await this._checkPolicies(
      action.policy,
      client,
      id,
      params
    ).next()!;

    const result = await action.exec.call(
      this,
      { target: target!, client },
      ...params
    );

    if (typeof result === "object" && Array.isArray(result?.notify)) {
      /* Validate the return from the action call */
      const keys = Object.keys(result);
      if ("response" in result ? keys.length > 2 : keys.length > 1) {
        console.warn(
          "Action returned an object with a `notify` array, but also contains fields other than response. This potentially indicates a bug. Check the ActionResult type for reference."
        );
      }

      /* Invalidate side effects and return value */
      result.notify.forEach((handle: Volatile) => handle.invalidate(true));
      return result.response;
    } else {
      return result;
    }
  }

  /** @internal */
  _list(client: Client | Collection<any>, id: string) {
    const { fields = {}, queries = {}, actions = {} } = this.model;

    const allowedFields = this._allowedKeys(client, id, fields).p((names) =>
      names.map((name) => `.${name}`)
    );
    const allowedQueries = this._allowedKeys(client, id, queries).p((names) =>
      names.map((name) => `/${name}?`)
    );
    const allowedActions = this._allowedKeys(client, id, actions).p((names) =>
      names.map((name) => `/${name}`)
    );

    return Cascade.all([allowedFields, allowedActions, allowedQueries]).p(
      (names) => names.flat()
    );
  }

  constructor(readonly model: M, private store: Whenever<Store<M>>) {}

  resource(id: string) {
    return new Resource(this, id);
  }

  query<Name extends keyof Queries<M>>(
    client: Client | Collection<any>,
    name: Name,
    ...params: Parameters<Queries<M>[Name]>
  ) {
    return this._query(client, null, name, ...params);
  }

  action<Name extends keyof Actions<M>>(
    client: Client | Collection<any>,
    name: Name,
    ...params: Parameters<Actions<M>[Name]>
  ) {
    return this._action(client, null, name, ...params);
  }

  handle(...ids: `${string}:${NonNullable<HandleName<M>> | ""}`[]) {
    return ids.map((name) => this._handle(name));
  }
}

export class Resource<M extends Model> {
  constructor(readonly collection: Collection<M>, readonly id: string) {}

  /**
   * Gets all available fields (except those with fetch=false), and queries with
   * fetch=true.
   */
  fetch(client: Client, includeQueries?: boolean) {
    return this.collection._fetch(client, this.id, includeQueries);
  }

  field<Name extends keyof Fields<M> & string>(
    client: Client | Collection<any>,
    name: Name
  ) {
    return this.collection._field(client, this.id, name);
  }

  query<Name extends keyof Queries<M>>(
    client: Client | Collection<any>,
    name: Name,
    ...params: Parameters<Queries<M>[Name]>
  ) {
    return this.collection._query(client, this.id, name, ...params);
  }

  action<Name extends keyof Actions<M>>(
    client: Client | Collection<any>,
    name: Name,
    ...params: Parameters<Actions<M>[Name]>
  ) {
    return this.collection._action(client, this.id, name, ...params);
  }

  handle(...ids: HandleName<M>[]) {
    return ids.map((name) => this.collection._handle(`${this.id}:${name}`));
  }
}
