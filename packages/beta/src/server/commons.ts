import { Cascade } from "@koreanwglasses/cascade";
import {
  BAD_REQUEST,
  Client,
  Collection,
  HTTPError,
  Model,
  NOT_IMPLEMENTED,
  Resource,
} from "@koreanwglasses/commons-core";
import asyncHandler from "express-async-handler";
import express, { Request, Response, Router } from "express";
import { Server, Namespace } from "socket.io";
import hash from "object-hash";
import jsonpatch from "fast-json-patch";
import { customRandom, nanoid, urlAlphabet } from "nanoid";
import seedrandom from "seedrandom";

const debug = (...args: any) => {
  if (process.env.NODE_ENV === "development") console.log(...args);
};

type Packed = { result: unknown; refs: Record<string, any> };

export class Commons {
  private io: Namespace;
  private makeClient: (req: Request) => Client;

  constructor({
    server,
    namespace = "/commons.io",
    makeClient,
  }: {
    server: Server;
    namespace?: string;
    makeClient: (req: Request) => Client;
  }) {
    this.io = server.of(namespace);
    this.makeClient = makeClient;

    this.io.on("connect", (socket) => {
      debug(`> New connection on ${socket.id}`);
    });
  }

  /**
   * Recursively fetch/evaluate queries and pack into a single-level cascade
   */
  private pack(
    client: Client,
    value: unknown,
    refs: Record<string, any> = {}
  ): Cascade<Packed> {
    return Cascade.$({ value }).$(({ value }) => {
      if (value instanceof Resource) {
        if (value.id in refs)
          return { result: { __commons_ref: value.id }, refs };

        return Cascade.$({
          packed: this.pack(client, value.fetch(client), {
            ...refs,
            [value.id]: {
              /* placeholder */
            },
          }),
          list: value.list(client),
        }).$(($) => ({
          result: { __commons_ref: value.id },
          refs: {
            ...$.packed.refs,
            [value.id]: {
              ...($.packed.result as object),
              __commons_list: $.list,
            },
          },
        }));
      } else if (value instanceof Collection) {
        if (value.model.name in refs)
          return { result: { __commons_ref: value.model.name }, refs };

        return Cascade.$({
          packed: this.pack(client, value.fetch(client), {
            ...refs,
            [value.model.name]: {
              /* placeholder */
            },
          }),
          list: value.list(client),
        }).$(($) => ({
          result: { __commons_ref: value.model.name },
          refs: {
            ...$.packed.refs,
            [value.model.name]: {
              ...$($.packed.result as object),
              __commons_list: $.list,
            },
          },
        }));
      } else if (Array.isArray(value)) {
        return value
          .reduce<Cascade<{ result: any[]; refs: Record<string, any> }>>(
            (acc, value) =>
              acc
                .$(($) => $({ packed: this.pack(client, value, $.refs) }))
                .$(($) => {
                  $.result.push($.packed.result);
                  $.refs = $.packed.refs;
                  return $({
                    packed: undefined,
                  });
                }),
            Cascade.$({ result: [] as any[], refs })
          )
      } else if (value && typeof value === "object") {
        return Object.entries(value)
          .reduce(
            (acc, [key, value]) =>
              acc
                .$(($) => $({ packed: this.pack(client, value, $.refs) }))
                .$(($) => {
                  $.result[key] = $.packed.result;
                  $.refs = $.packed.refs;
                  return $({
                    packed: undefined,
                  });
                }),
            Cascade.$({ result: {} as any, refs })
          )
      } else {
        return { result: value, refs };
      }
    });
  }

  private shortenRefs(packed: Packed) {
    const length = 4;
    /**
     * Generates reasonably stable, cryptographically UNsafe hashes to shorten
     * ref ids
     */
    const shorten = (string: string, exclude: Set<string> = new Set()) => {
      const rng = seedrandom(string);
      const hasher = customRandom(urlAlphabet, length, (n) => {
        return new Uint8Array(n).map(() => 256 * rng());
      });
      let result: string;
      while (exclude.has((result = hasher())));
      return result;
    };

    const refsRemap = {} as Record<string, string>;

    const newKeys = new Set<string>(Object.keys(packed.refs));
    Object.keys(packed.refs).forEach((key) =>
      newKeys.add((refsRemap[key] = shorten(key, newKeys)))
    );

    const remap = (value: any): any => {
      if (Array.isArray(value)) {
        return value.map(remap);
      } else if (value && typeof value === "object") {
        const remapped = {} as any;
        for (const key in value) {
          if (key === "__commons_ref") {
            remapped[key] = refsRemap[value[key]];
          } else {
            remapped[key] = remap(value[key]);
          }
        }
        return remapped;
      } else {
        return value;
      }
    };

    const refs = Object.fromEntries(
      Object.entries(packed.refs).map(([key, value]) => [
        refsRemap[key],
        remap(value),
      ])
    );
    const result = remap(packed.result);

    return { refs, result };
  }

  /**
   * Resolves nested routes ot the appropriate data endpoint
   */
  private resolve(
    method: "GET" | "POST",
    client: Client,
    base: Collection<any> | Resource<any> | Record<string | number, any>,
    path: string[] = [],
    ...params: any
  ): Cascade<Packed> {
    if (base instanceof Collection) {
      debug(`> resolving ${base.model.name}:${path.join("/")}`);
    } else if (base instanceof Resource) {
      debug(
        `> resolving ${base.collection.model.name}/${base.id}:${path.join("/")}`
      );
    } else {
      debug(`> resolving [object]:${path.join("/")}`);
    }

    if (path.length === 0) {
      debug("> packing");
      return this.pack(client, base);
    }

    const isCommons = base instanceof Collection || base instanceof Resource;
    if (!(isCommons || (base && typeof base === "object"))) {
      throw new HTTPError(500, "Invalid route");
    }

    if (path.length === 1) {
      if (method === "GET") {
        if (isCommons) {
          debug("> packing");
          return this.pack(client, base.query(client, path[0], ...params));
        } else {
          debug("> packing");
          return this.pack(client, base);
        }
      }
      if (method === "POST") {
        if (!isCommons) {
          throw BAD_REQUEST("Cannot post to a non-commons object");
        }
        debug("> packing");
        return this.pack(client, base.action(client, path[0], ...params));
      }
    }

    // path.length > 1
    if (
      base instanceof Collection &&
      !(path[0] in (base.model.queries ?? {}))
    ) {
      return this.resolve(
        method,
        client,
        base.resource(path[0]), // if path[0] is not a query, assume its an id
        path.slice(1),
        ...params
      );
    } else if (isCommons) {
      return Cascade.$({ result: base.query(client, path[0]) }).$(($) =>
        this.resolve(method, client, $.result, path.slice(1), ...params)
      );
    } else {
      return this.resolve(
        method,
        client,
        base[path[0]],
        path.slice(1),
        ...params
      );
    }
  }

  serve(collection: Collection<Model>) {
    const pipeToSocket = (req: Request, cascade: Cascade<Packed>) => {
      const socketId = req.query.__commons_socket_id;
      if (typeof socketId !== "string") throw BAD_REQUEST("Invalid socket id");

      const socket = this.io.sockets.get(socketId);
      if (!socket) throw BAD_REQUEST("Could not find socket");

      const dataKey = nanoid();

      const debugRoute = `${collection.model.name}:${req.path}`;
      const devDebugInfo = `of ${dataKey.slice(
        0,
        4
      )}... from ${debugRoute} to ${socket.id.slice(0, 4)}...`;
      debug(`> Opening cascade ${devDebugInfo}`);

      const last: { result: any } = { result: undefined };
      socket.on(`cascade:${dataKey}:resend`, () => {
        debug(`> Resending ${devDebugInfo}`);
        socket.emit(`cascade:${dataKey}:value`, last.result);
      });

      const pipe = cascade
        .p(this.shortenRefs)
        .p((value) => {
          debug(`> Sending diff ${devDebugInfo}`);

          const diff = jsonpatch.compare(last, { result: value });
          last.result = value;
          socket.emit(`cascade:${dataKey}:diff`, diff, hash(value));
        })
        .catch((error) => {
          console.error(
            `Error in cascade ${
              process.env.NODE_ENV === "development"
                ? devDebugInfo
                : `from ${debugRoute}`
            }\n`,
            error
          );

          socket.emit(`cascade:${dataKey}:error`, {
            name: error.name,
            message: error.message,
            code: error.code,
          });
        });

      const close = () => {
        debug(`> Closing cascade ${devDebugInfo}`);
        pipe.close();
      };

      socket.on("disconnect", close);
      socket.on(`cascade:${dataKey}:close`, close);

      return dataKey;
    };

    const handler = asyncHandler(async (req_, res_) => {
      const req = req_ as Request;
      const res = res_ as Response;

      debug(`> Received request for ${collection.model.name}:${req.path}`);

      try {
        const client = this.makeClient(req);
        const method = req.method;
        if (!(method === "GET" || method === "POST")) {
          throw NOT_IMPLEMENTED();
        }

        const path = req.params[0].split("/").filter((s) => s);

        const params =
          method === "GET"
            ? JSON.parse((req.query.params as string) ?? "[]")
            : req.body.params ?? [];

        const result = this.resolve(
          method,
          client,
          collection,
          path,
          ...params
        );

        if (
          method === "GET" &&
          JSON.parse((req.query.__commons_subscribe as string) ?? "false")
        ) {
          res.send(pipeToSocket(req, result));
        } else {
          res.send(await result.next());
        }
      } catch (e) {
        console.error(
          `Error while handling request (${collection.model.name}:${req.path}):`,
          e
        );
        if (e instanceof Error) {
          res.statusCode = (e as any).code ?? 500;
          if (process.env.NODE_ENV === "development") res.send(`${e.stack}`);
          else res.send(`${e.message}`);
        } else {
          res.sendStatus(500);
        }
      }
    });

    const router = Router();
    router.use(express.json());
    router.get("(/*)?", handler);
    router.post("(/*)?", handler);
    return router;
  }
}
