import { connect } from "./database";
import MongoDBStoreFactory from "connect-mongodb-session";
import { uri } from "./database";
import { Rooms } from "../resources/room";
import { Sessions } from "../resources/session";
import next from "next";
import express from "express";
import { Commons } from "@koreanwglasses/commons-beta/server";
import expressSession from "express-session";
import { Users } from "../resources/user";
import iosession from "express-socket.io-session";
import { Server as IO } from "socket.io";

const nextApp = next({ dev: process.env.NODE_ENV === "development" });
const handler = nextApp.getRequestHandler();

const app = express();

const session = expressSession({
  secret: "secret",
  store: new (MongoDBStoreFactory(expressSession))({
    uri,
    collection: "sessions",
  }),
  resave: true,
  saveUninitialized: true,
});
app.use(session);

const io = new IO();

io.of("/commons.io").use(iosession(session, { autoSave: true }) as any);
io.of("/commons.io").on("connect", (socket) => {
  const session = (socket.handshake as any).session;

  if (session?.userId) {
    Users.$[session.userId].actions._reconnect();
  }

  socket.on("disconnect", () => {
    const session = (socket.handshake as any).session;
    if (session?.userId && Object.values(session?.sockets).length === 0) {
      Users.$[session.userId].actions._disconnect(Date.now());
    }
  });
});

const commons = new Commons({
  server: io,
  makeClient(req) {
    return { sessionId: req.session.id };
  },
});

app.use("/api/session", commons.serve(Sessions));
app.use("/api/room", commons.serve(Rooms));

(async () => {
  await nextApp.prepare();
  await connect();

  app.all(/\/(?!api\/(session|room)).*/, (req, res) => {
    if (!(req.path.startsWith("/_next/") || req.path.startsWith("/__nextjs")))
      console.log("next", req.path);
    return handler(req, res);
  });

  const server = app.listen(3000, () => {
    console.log("> Server listening on http://localhost:3000");
  });
  io.attach(server);
})();
