import { Cascade } from "@koreanwglasses/cascade";
import {
  Client,
  Collection,
  Model,
  NOT_FOUND,
  Resource,
} from "@koreanwglasses/commons-core";
import { getSocket } from "@koreanwglasses/nexs";
import asyncHandler from "express-async-handler";
import { v4 as uuid } from "uuid";
import express, { Request, Response } from "express";
import type nexs from "@koreanwglasses/nexs-server";
import type { NextApiRequest } from "next";
import type { Server as IO } from "socket.io";
import type { Session } from "express-session";

declare module "express-session" {
  interface Session {
    sockets: Record<number, string>;
    userId: string;
  }
}

declare module "next" {
  interface NextApiRequest {
    session: Session;
    io: IO;
  }
}

export default function NEXSCommons() {
  let collections: [string, Collection<Model>][] = [];

  const serve = (basepath: string, collection: Collection<Model>) => {
    collections.push([basepath, collection]);
  };

  /**
   * Resolves nested routes ot the appropriate data endpoint
   */
  const resolve = async (
    method: "GET" | "POST",
    client: Client,
    base: unknown,
    path: string[],
    ...params: any
  ): Promise<Cascade<unknown>> => {
    if (path.length === 0) {
      if (base instanceof Resource) {
        return base.fetch(client, true);
      } else if (base instanceof Collection && path.length === 0) {
        throw NOT_FOUND;
      } else {
        return Cascade.const(base);
      }
    }

    if (
      method === "POST" &&
      (base instanceof Collection || base instanceof Resource) &&
      path.length === 1
    ) {
      return resolve(
        method,
        client,
        await base.action(client, path[0], ...params),
        path.slice(1)
      );
    }

    if (path.length >= 1) {
      if (
        base instanceof Collection &&
        !(path[0] in (base.model.queries ?? {}))
      ) {
        // If path[0] is not a query, assume its an id
        return resolve(
          method,
          client,
          base.resource(path[0]),
          path.slice(1),
          ...params
        );
      } else if (base instanceof Resource || base instanceof Collection) {
        return base
          .query(client, path[0])
          .j((value) =>
            resolve(method, client, value, path.slice(1), ...params)
          );
      } else {
        throw NOT_FOUND;
      }
    }

    throw NOT_FOUND;
  };

  const attach = (app: ReturnType<typeof nexs>) => {
    const pipeToSocket = (req: Request, cascade: Cascade) => {
      const nreq = req as unknown as NextApiRequest;
      nreq.io = app.io;

      const socket = getSocket(nreq);

      const dataKey = uuid();

      const pipe = cascade
        .p((value) => {
          socket.emit(`cascade:${dataKey}:value`, value);
        })
        .catch((error) => {
          socket.emit(`cascade:${dataKey}:error`, error);
        });

      const close = () => {
        console.log("Closing", dataKey, "from", req.path);
        pipe.close();
      };

      socket.on("disconnect", close);
      socket.on(`cascade:${dataKey}:close`, close);

      return dataKey;
    };

    // Forwards requests to collection and resolves the result
    const handler = (basepath: string, collection: Collection<Model>) =>
      asyncHandler(async (req_, res_) => {
        const req = req_ as Request;
        const res = res_ as Response;

        try {
          const client = { sessionId: req.session.id };
          const method = req.method;
          if (!(method === "GET" || method === "POST")) {
            throw 503; // Not Implemented
          }

          const path = req.path
            .slice(basepath.length)
            .split("/")
            .filter((s) => s);
          if (req.params.id) path[0] = req.params.id;

          const result = await resolve(
            method,
            client,
            collection,
            path,
            method === "GET" ? req.query : req.body
          );

          if (
            method === "GET" &&
            JSON.parse((req.query._commons_subscribe as string) ?? "false")
          ) {
            res.send(pipeToSocket(req, result));
          } else {
            res.send(await result.next());
          }
        } catch (e) {
          if (typeof e === "number") {
            res.sendStatus(e);
          } else {
            console.error(e, (e as any).trace);
            res.sendStatus(500);
          }
        }
      });

    const mount = (basepath: string, collection: Collection<Model>) => {
      const prefix = basepath.endsWith("/") ? basepath : basepath + "/";

      Object.keys(collection.model.queries ?? {}).forEach((name) => {
        app.express.get(prefix + `${name}(/*)?`, handler(prefix, collection));
        app.express.get(
          prefix + `:id/${name}(/*)?`,
          handler(prefix, collection)
        );
      });

      Object.keys(collection.model.actions ?? {}).forEach((name) => {
        app.express.post(prefix + `${name}(/*)?`, handler(prefix, collection));
        app.express.post(
          prefix + `:id/${name}(/*)?`,
          handler(prefix, collection)
        );
      });
    };

    // Mount the collections using express routes
    app.express.use(express.json());
    collections.forEach(([basepath, collection]) =>
      mount(basepath, collection)
    );
  };

  return {
    serve,
    attach
  };
}
