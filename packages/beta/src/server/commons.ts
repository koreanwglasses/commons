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
import { v4 as uuid } from "uuid";
import hash from "object-hash";
import jsonpatch from "fast-json-patch";

const debug = (...args: any) => {
  if (process.env.NODE_ENV === "development") console.log(...args);
};

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
      debug(`New connection: ${socket.id}`);
    });
  }

  /**
   * Recursively fetch/evaluate queries and pack into a single-level cascade
   */
  private pack(
    client: Client,
    value: unknown,
    refs: Record<string, any> = {}
  ): Cascade<{ result: unknown; refs: Record<string, any> }> {
    return Cascade.$({ value }).$(({ value }) => {
      if (value instanceof Resource) {
        if (value.id in refs)
          return { result: { __commons_ref: value.id }, refs: {} };

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
            ...refs,
            ...$.packed.refs,
            [value.id]: {
              ...($.packed.result as object),
              __commons_list: $.list,
            },
          },
        }));
      } else if (value instanceof Collection) {
        if (value.model.name in refs)
          return { result: { __commons_ref: value.model.name }, refs: {} };

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
            ...refs,
            ...$.packed.refs,
            [value.model.name]: {
              ...$($.packed.result as object),
              __commons_list: $.list,
            },
          },
        }));
      } else if (Array.isArray(value)) {
        return value.reduce<
          Cascade<{ result: any[]; refs: Record<string, any> }>
        >(
          (acc, value) =>
            Cascade.$({ acc })
              .$(($) => $({ contents: this.pack(client, value, $.acc.refs) }))
              .$(($) => ({
                result: [...$.acc.result, $.contents.result],
                refs: { ...$.acc.refs, ...$.contents.refs },
              })),
          Cascade.const({ result: [], refs: {} })
        );
      } else if (value && typeof value === "object") {
        return Object.entries(value).reduce<
          Cascade<{ result: Record<any, any>; refs: Record<string, any> }>
        >(
          (acc, [key, value]) =>
            Cascade.$({ acc })
              .$(($) => $({ contents: this.pack(client, value, $.acc.refs) }))
              .$(($) => ({
                result: { ...$.acc.result, [key]: $.contents.result },
                refs: { ...$.acc.refs, ...$.contents.refs },
              })),
          Cascade.const({ result: {}, refs: {} })
        );
      } else {
        return { result: value, refs: {} };
      }
    });
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
  ): Cascade<unknown> {
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
      return this.pack(client, base);
    }

    const isCommons = base instanceof Collection || base instanceof Resource;
    if (!(isCommons || (base && typeof base === "object"))) {
      throw new HTTPError(500, "Invalid route");
    }

    if (path.length === 1) {
      if (method === "GET") {
        if (isCommons) {
          return this.pack(client, base.query(client, path[0], ...params));
        } else {
          return this.pack(client, base);
        }
      }
      if (method === "POST") {
        if (!isCommons) {
          throw BAD_REQUEST("Cannot post to a non-commons object");
        }
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
    const pipeToSocket = (req: Request, cascade: Cascade) => {
      const socketId = req.query.__commons_socket_id;
      if (typeof socketId !== "string") throw BAD_REQUEST("Invalid socket id");

      const socket = this.io.sockets.get(socketId);
      if (!socket) throw BAD_REQUEST("Could not find socket");

      const dataKey = uuid();
      debug(`Opening cascade on ${socket.id} (${req.path})`);

      const last: { result: any } = { result: undefined };
      socket.on(`cascade:${dataKey}:resend`, () => {
        debug(`Resending data on ${socket.id} (${req.path})`);
        socket.emit(`cascade:${dataKey}:value`, last.result);
      });

      const pipe = cascade
        .p((value) => {
          const diff = jsonpatch.compare(last, { result: value });
          last.result = value;
          socket.emit(`cascade:${dataKey}:diff`, diff, hash(value));
        })
        .catch((error) => {
          console.error(
            `Error from cascade ${
              process.env.NODE_ENV === "development" ? `on ${socket.id} ` : ""
            }(${collection.model.name}:${req.path}):\n`,
            error
          );

          socket.emit(`cascade:${dataKey}:error`, {
            name: error.name,
            message: error.message,
            code: error.code,
          });
        });

      const close = () => {
        debug(`Closing cascade on ${socket.id} (${req.path})`);
        pipe.close();
      };

      socket.on("disconnect", close);
      socket.on(`cascade:${dataKey}:close`, close);

      return dataKey;
    };

    const handler = asyncHandler(async (req_, res_) => {
      const req = req_ as Request;
      const res = res_ as Response;

      if (process.env.NODE_ENV === "development")
        console.log("received request for", req.path);

      try {
        const client = this.makeClient(req);
        const method = req.method;
        if (!(method === "GET" || method === "POST")) {
          throw NOT_IMPLEMENTED();
        }

        const path = req.params[0].split("/").filter((s) => s);

        const params =
          method === "GET"
            ? JSON.stringify(req.query.params ?? "[]")
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
