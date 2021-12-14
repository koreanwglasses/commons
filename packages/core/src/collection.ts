import { Cascade, Volatile } from "@koreanwglasses/cascade";
import {
  Actions,
  Model,
  Fields,
  StaticPolicy,
  Client,
  Queries,
  ACCESS_NEVER,
  ACCESS_DENY,
  AccessType,
  Policy,
  ALLOW_NONE,
  ALLOW_ALL,
  NOT_FOUND,
  FORBIDDEN,
} from ".";
import { Store } from "./supplier";
import { Whenever } from "./types";

const throwPolicy = (access: AccessType) => {
  if (access === ACCESS_NEVER) throw NOT_FOUND();
  if (access === ACCESS_DENY) throw FORBIDDEN();
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
  _handles: Record<any, Cascade> = {};

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
      if (!item) throw NOT_FOUND();
    });
  }

  /** @internal */
  _checkResourcePolicy(
    client: Client | Collection<any>,
    id: string
  ): Cascade<Resource<M>> {
    const { policy = ALLOW_ALL } = this.model;
    const target = this._checkExistence(id).p(() => this.resource(id));

    if (client instanceof Collection) {
      // Skip policy check if client is internal
      return Cascade.flatten(target);
    }

    return Cascade.$({ target })
      .$(($) =>
        $({
          accessType: policy.apply(this, [$.target, client] as any),
        })
      )
      .$(($) => throwPolicy($.accessType))
      .$(($) => $.target);
  }

  /** @internal */
  _checkPolicies(
    policy: Policy<M> | StaticPolicy<M> | undefined = ALLOW_NONE,
    client: Client | Collection<any>,
    id: string | null,
    params: unknown[] = []
  ): Cascade<Resource<M> | void> {
    if (!id) {
      /* STATIC */
      if (client instanceof Collection) {
        // Skip policy check if client is internal
        return new Cascade(() => {});
      }

      return Cascade.flatten(
        (policy as StaticPolicy<M>).apply(this, [
          null,
          client,
          ...params,
        ] as any)
      ).p(throwPolicy);
    }

    const target = this._checkResourcePolicy(client, id!);

    if (client instanceof Collection) {
      // Skip policy check if client is internal
      return target;
    }

    return Cascade.$({ target })
      .$(($) =>
        $({
          accessType: (policy as Policy<M>).apply(this, [
            $.target,
            client,
            ...params,
          ] as any),
        })
      )
      .$(($) => throwPolicy($.accessType))
      .$(($) => $.target);
  }

  /** @internal */
  _allowedKeys(
    client: Client,
    id: string | null,
    map: Record<string, { policy?: Policy<M> | StaticPolicy<M> }>
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

    return this._checkPolicies(field.policy, client, id)
      .$(async (_, deps) => {
        deps(handle);
        return (await this.store).findById(id, [name]);
      })
      .$((record) => (record as Partial<Fields<M>> | null)?.[name]);
  }

  /** @internal */
  _fetch(
    client: Client | Collection<any>,
    id: string
  ): Cascade<
    Partial<Fields<M>> &
      Partial<{ [K in keyof Queries<M>]: ReturnType<Queries<M>[K]> }>
  > {
    const { fields, queries } = this.model;

    const fieldsToFetch = Object.fromEntries(
      Object.entries(fields ?? {}).filter(([_, v]) => v.fetch ?? true)
    );

    const queriesToFetch = Object.fromEntries(
      Object.entries(queries ?? {}).filter(
        ([_, v]) => !v.isStatic && (v.autoFetch ?? false)
      )
    );

    return Cascade.$(() => {
      this._checkResourcePolicy(client, id);
    })
      .$({
        store: this.store,
        allowed: this._allowedKeys(client, id, fieldsToFetch),
      })
      .$(($) =>
        $({ handles: $.allowed.map((name) => this._fieldHandle(id, name)) })
      )
      .$(($, deps) => {
        deps(...$.handles);
        return $({
          item: $.store.findById(id, $.allowed),
          store: null,
          handles: null,
        });
      })
      .$(($) => {
        if (!$.item) throw NOT_FOUND();
        return $({
          fieldResults: Object.fromEntries(
            Object.entries($.item as Partial<Fields<M>>).filter(([key]) =>
              $.allowed.includes(key)
            )
          ),
          item: null,
          allowed: null,
        });
      })
      .$({
        queryEntries: Cascade.all(
          Object.keys(queriesToFetch).map((name) =>
            this._query(client, id, name, ...([] as any))
              .p((result) => [name, result] as const)
              .catch(() => undefined)
          )
        ),
      })
      .$(($) =>
        $({
          queryResults: Object.fromEntries(
            $.queryEntries.filter((entry) => entry) as [
              string,
              ReturnType<Queries<M>[string]>
            ][]
          ),
          queryEntries: null,
        })
      )
      .p(($) => ({
        ...($.fieldResults as Partial<Fields<M>>),
        ...$.queryResults,
      }));
  }

  /** @internal */
  _fetchStatic(
    client: Client | Collection<any>
  ): Cascade<Partial<{ [K in keyof Queries<M>]: ReturnType<Queries<M>[K]> }>> {
    const { queries } = this.model;

    const queriesToFetch = Object.fromEntries(
      Object.entries(queries ?? {}).filter(
        ([_, v]) => v.isStatic && (v.autoFetch ?? false)
      )
    );

    return Cascade.$({
      queryEntries: Cascade.all(
        Object.keys(queriesToFetch).map((name) =>
          this._query(client, null, name, ...([] as any))
            .p((result) => [name, result] as const)
            .catch(() => undefined)
        )
      ),
    }).p(
      ($) =>
        Object.fromEntries(
          $.queryEntries.filter((entry) => entry) as any
        ) as any
    );
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

    if (!query || (!query.isStatic && !id))
      return Cascade.error(
        NOT_FOUND(
          `${
            client instanceof Collection
              ? `(Caller: ${client.model.name}) `
              : ""
          }Cannot get non-static query without specifying an id`
        )
      );

    const handle = this._queryHandle(id, name);

    return this._checkPolicies(query.policy, client, id, params)
      .p((target, deps) => {
        deps(handle);
        return query.get.call(this, { target: target!, client }, ...params);
      })
      .p((result, deps) => {
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
      .flat();
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

    if (!action || (!action.isStatic && !id))
      throw NOT_FOUND(
        `${
          client instanceof Collection ? `(Caller: ${client.model.name}) ` : ""
        }Cannot execute non-static action without specifying an id`
      );

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
  _list(
    client: Client | Collection<any>,
    id: string | null
  ): Cascade<(keyof Actions<M> & string)[]> {
    const { actions = {} } = this.model;

    return this._allowedKeys(client, id, actions).p((names) =>
      names.map((name) => `/${name}`)
    );
  }

  constructor(readonly model: M, private store: Whenever<Store<M>>) {}

  fetch(client: Client | Collection<any>) {
    return this._fetchStatic(client);
  }

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

  list(client: Client | Collection<any>) {
    return this._list(client, null);
  }

  handle(...ids: `${string}:${NonNullable<HandleName<M>> | ""}`[]) {
    return ids.map((name) => this._handle(name));
  }

  //////////////////////////
  // ALIASES & SHORTHANDS //
  //////////////////////////

  /**
   * Shorthand for this.resource
   *
   * this.$[id] === this.resource(id)
   */
  readonly $ = new Proxy(
    {},
    {
      get: (_, prop) => {
        if (typeof prop === "string") {
          return this.resource(prop);
        }
      },
    }
  ) as { [id: string]: Resource<M> };

  readonly queries = shorthandProxy(
    this,
    this.model.queries,
    (client, name, ...params) => this.query(client, name, ...params)
  ) as QueryShorthands<M>;

  readonly q = this.queries;

  readonly actions = shorthandProxy(
    this,
    this.model.actions,
    (client, name, ...params) => this.action(client, name, ...params)
  ) as ActionShorthands<M>;

  readonly a = this.actions;
}

export class Resource<M extends Model> {
  constructor(readonly collection: Collection<M>, readonly id: string) {}

  /**
   * Gets all available fields (except those with fetch=false), and queries with
   * fetch=true.
   */
  fetch(client: Client) {
    return this.collection._fetch(client, this.id);
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

  list(client: Client | Collection<any>) {
    return this.collection._list(client, this.id);
  }

  handle(...ids: HandleName<M>[]) {
    return ids.map((name) => this.collection._handle(`${this.id}:${name}`));
  }

  //////////////////////////
  // ALIASES & SHORTHANDS //
  //////////////////////////

  /**
   * Shorthand for this.field
   *
   * this.$[name] === this.field(this.collection, name)
   * this.$[name].as(client) === this.field(client, name)
   */
  readonly $ = new Proxy(this.collection.model.fields ?? {}, {
    get: (target, prop, receiver) => {
      if (
        (typeof prop === "string" || typeof prop === "number") &&
        prop in target
      ) {
        return Object.assign(this.field(this.collection, prop), {
          as: (client: Client | Collection<any>) => this.field(client, prop),
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as FieldShorthands<M>;

  readonly queries = shorthandProxy(
    this.collection,
    this.collection.model.queries,
    (client, name, ...params) => this.query(client, name, ...params)
  ) as QueryShorthands<M>;

  readonly q = this.queries;

  readonly actions = shorthandProxy(
    this.collection,
    this.collection.model.actions,
    (client, name, ...params) => this.action(client, name, ...params)
  ) as ActionShorthands<M>;

  readonly a = this.actions;
}

///////////////
// SHORTHAND //
///////////////

const shorthandProxy = (
  collection: Collection<any>,
  record: Record<string, unknown> | undefined,
  func: (client: Client | Collection<any>, name: string, ...params: any) => any
) =>
  new Proxy(record ?? {}, {
    get: (target, prop, receiver) => {
      if (typeof prop === "string" && prop in target) {
        return Object.assign(
          function (...params: any) {
            return func(collection, prop, ...params);
          },
          {
            as: (client: Client | Collection<any>, ...params: any) =>
              func(client, prop, ...params),
          }
        );
      }
      return Reflect.get(target, prop, receiver);
    },
  });

type FieldShorthands<M extends Model> = {
  [K in keyof Fields<M>]: Cascade<Fields<M>[K]> & {
    as(client: Client | Collection<any>): Fields<M>[K];
  };
};

type QueryShorthands<M extends Model> = {
  [K in keyof Queries<M>]: ((
    ...params: Parameters<Queries<M>[K]>
  ) => Cascade<ReturnType<Queries<M>[K]>>) & {
    as(
      client: Client | Collection<any>,
      ...params: Parameters<Queries<M>[K]>
    ): Cascade<ReturnType<Queries<M>[K]>>;
  };
};

type ActionShorthands<M extends Model> = {
  [K in keyof Actions<M>]: ((
    ...params: Parameters<Actions<M>[K]>
  ) => Promise<ReturnType<Actions<M>[K]>>) & {
    as(
      client: Client | Collection<any>,
      ...params: Parameters<Actions<M>[K]>
    ): Promise<ReturnType<Actions<M>[K]>>;
  };
};
