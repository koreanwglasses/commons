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

  // Setup listeners for streamed data
  const cascades = {} as Record<string, Managed>;
  const getCascade = (dataKey: string) => {
    if (!cascades[dataKey]) {
      cascades[dataKey] = new Managed();
      cascades[dataKey].onClose(() => {
        console.debug(`Closing ${dataKey}`);

        socket.emit(`cascade:${dataKey}:close`);
        socket.off(`cascade:${dataKey}:value`);
        socket.off(`cascade:${dataKey}:error`);

        delete cascades[dataKey];
        delete diffBase[dataKey];
      });
    }
    return cascades[dataKey];
  };
  const diffBase = {} as Record<string, { result: Packed }>;
  socket.onAny((event: string, data, expectedHash) => {
    if (event.startsWith("cascade:") && event.endsWith(":diff")) {
      console.debug(`Received diff of size ${JSON.stringify(data).length}`);
    }

    const [, dataKey, method] =
      /^cascade:(.*):(diff|value|error)$/.exec(event) ?? [];

    if (dataKey && method) {
      const cascade = getCascade(dataKey);
      if (method === "error") cascade.error(data);
      if (method === "value") {
        cascade.value(data);
        diffBase[dataKey].result = data;
      }
      if (method === "diff") {
        // do json round trip so jsonpatch can work properly
        const next = JSON.parse(
          JSON.stringify((diffBase[dataKey] ??= { result: undefined as any }))
        );
        jsonpatch.applyPatch(next, data);
        const value = next.result;

        const actualHash = hash(value);
        if (expectedHash !== actualHash) {
          console.debug(
            `Hash mismatch (expected: ${expectedHash}, got: ${actualHash}). Requesting server for un-diffed data.`
          );
          socket.emit(`cascade:${dataKey}:resend`);
        } else {
          diffBase[dataKey].result = value;
          cascade.value(value);
        }
      }
    }
  });

  const connect = new Promise<void>((res) => socket.once("connect", res));

  // Define exported functions
  const unpack = (packed: Packed) => {
    const join = (...parts: string[]) =>
      parts.map((part) => (part.endsWith("/") ? part : part + "/")).join("");

    const isRef = (value: any) =>
      value && typeof value === "object" && "__commons_ref" in value;

    const refs = {} as any;

    const link = (path: string, value: any): any => {
      if (isRef(value)) {
        return refs[value.__commons_ref](path);
      } else if (Array.isArray(value)) {
        return value.map((item, i) => link(join(path, `${i}`), item));
      } else if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([key, value]) => [
            key,
            link(join(path, key), value),
          ])
        );
      } else {
        return value;
      }
    };

    Object.entries(packed.refs).forEach(([key, data]) => {
      const { __commons_list, ...result } = data;

      refs[key] = (path: string) => {
        const actions = {} as any;

        (__commons_list as string[]).forEach((item) => {
          if (item.startsWith("/") && !item.endsWith("?")) {
            const name = item.slice(1);
            actions[name] = (...params: any) =>
              action(join(path, name), ...params);
          }
        });

        return {
          get state() {
            return link(path, result);
          },
          actions,
        };
      };
    });

    const result = link(packed.path, packed.result);
    console.debug("Unpacked", result);
    return result;
  };

  const query = (path: string, ...params: any) => {
    console.debug("Sending request to", path);

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
        return $({ packed: getCascade($.dataKey) });
      })
      .$(($) => {
        console.debug(`Packed response (${path}):`, $.packed);
      })
      .$(($) => ({ ...$.packed, path } as Packed));
  };

  const queryOnce = async <T = any>(
    path: string,
    ...params: any
  ): Promise<Unpacked<T>> => {
    return unpack(await query(path, ...params).next());
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

  return { query, queryOnce, action, unpack };
}

export type CommonsClient = ReturnType<typeof commons>;
