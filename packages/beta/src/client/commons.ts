import { Cascade, Managed } from "@koreanwglasses/cascade";
import {
  Collection,
  Resource,
  Fields,
  Queries,
  Actions,
} from "@koreanwglasses/commons-core";
import { io, Socket } from "socket.io-client";
import jsonpatch from "fast-json-patch";
import hash from "object-hash";

export class FetchError extends Error {
  constructor(readonly name: string, message: string) {
    super(message);
  }
}

export type Packed = {
  path: string;
  result: any;
  refs: Record<string, any>;
};

export type Unpacked<C> = Partial<
  C extends Collection<infer M> | Resource<infer M>
    ? {
        state: Fields<M> & {
          [K in keyof Queries<M>]: Unpacked<ReturnType<Queries<M>[K]>>;
        };
        actions: {
          [K in keyof Actions<M>]: (
            ...params: Parameters<Actions<M>[K]>
          ) => Promise<ReturnType<Actions<M>[K]>>;
        };
      }
    : C extends object
    ? { [K in keyof C]: Unpacked<C[K]> }
    : C
>;

export default function commons({
  socket: _socket,
  init,
}: {
  socket?: Socket;
  init?: RequestInit;
} = {}) {
  const socket = _socket ?? io("/commons.io");

  socket.onAny((event: string, data) => {
    if (event.startsWith("cascade:") && event.endsWith(":diff")) {
      console.debug(`Received diff of size ${JSON.stringify(data).length}`);
    }
  });

  const connect = new Promise<void>((res) => socket.once("connect", res));

  const unpack = (packed: Packed) => {
    let prefix = packed.path.endsWith("/")
      ? packed.path.slice(0, -1)
      : packed.path;

    const refs = {} as any;
    const resolve = (actionPrefix: string, packed: any): any => {
      if (packed && typeof packed === "object" && "__commons_ref" in packed) {
        return refs[(packed as any).__commons_ref](actionPrefix);
      } else if (packed && typeof packed === "object") {
        const result = {};
        Object.entries(packed).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            Object.defineProperty(result, key, {
              get() {
                return value.map((value, i) =>
                  resolve(actionPrefix + "/" + key + "/" + i, value)
                );
              },
            });
          } else {
            Object.defineProperty(result, key, {
              get() {
                return resolve(actionPrefix + "/" + key, value);
              },
            });
          }
        });
        return result;
      } else {
        return packed;
      }
    };

    Object.entries(packed.refs).forEach(([key, data]) => {
      const { __commons_list, ...packed } = data;

      refs[key] = (actionPrefix: string) => {
        const actions = {} as any;

        (__commons_list as string[]).forEach((item) => {
          if (item.startsWith("/") && !item.endsWith("?")) {
            const name = item.slice(1);
            actions[name] = (...params: any) =>
              action(actionPrefix.slice(1) + "/" + name, ...params);
          }
        });

        return { state: resolve(actionPrefix, packed), actions };
      };
    });

    return resolve("", { [prefix]: packed.result })[prefix];
  };

  const query = (path: string, ...params: any) => {
    console.debug("Sending request to", path);

    const last: { result: any } = { result: undefined };
    return Cascade.$({ connect })
      .$(($) => {
        let url = path;
        if (!url.includes("?")) url += "?";
        else if (!url.endsWith("&")) url += "&";
        url += `params=${encodeURIComponent(
          JSON.stringify(params)
        )}&__commons_subscribe=true&__commons_socket_id=${socket.id}`;

        const response = fetch(url, init);
        return $({ response });
      })
      .$(async ($) => {
        if (!$.response.ok)
          throw new FetchError($.response.statusText, await $.response.text());
        return $({ dataKey: $.response.text(), response: null });
      })
      .$(($) => {
        const packed = new Managed();
        socket.on(`cascade:${$.dataKey}:diff`, (diff, expectedHash) => {
          // apply patchon copy of last so cascades can
          // properly detect/propagate the change
          const next = JSON.parse(JSON.stringify(last));
          jsonpatch.applyPatch(next, diff);
          const value = next.result;

          const actualHash = hash(value);
          if (expectedHash !== actualHash) {
            socket.emit(`cascade:${$.dataKey}:resend`);
          } else {
            packed.value(
              value,
              true /* needed since value was modified in-place */
            );
            last.result = value;
          }
        });
        socket.on(`cascade:${$.dataKey}:value`, (value) => {
          packed.value(value);
          last.result = value;
        });
        socket.on(`cascade:${$.dataKey}:error`, (error) => {
          packed.error(error);
        });
        packed.onClose(() => {
          console.debug(`Closing ${$.dataKey}`);

          socket.emit(`cascade:${$.dataKey}:close`);
          socket.off(`cascade:${$.dataKey}:value`);
          socket.off(`cascade:${$.dataKey}:error`);
        });
        return $({ packed });
      })
      .$(($) => ({ ...$.packed, path } as Packed));
  };

  const action = async <T = any>(path: string, ...params: any): Promise<T> => {
    const response = await fetch(path, {
      method: "POST",
      body: JSON.stringify({ params }),
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok)
      throw new FetchError(response.statusText, await response.text());

    try {
      return await response.clone().json();
    } catch (e) {
      return (await response.text()) as unknown as T;
    }
  };

  return { query, action, unpack };
}

export type CommonsClient = ReturnType<typeof commons>;
