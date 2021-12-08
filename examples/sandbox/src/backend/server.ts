import nexs from "@koreanwglasses/nexs-server";
import NEXSCommons from "@koreanwglasses/commons-nexs-server";
import { connect } from "./database";
import MongoDBStoreFactory from "connect-mongodb-session";
import { uri } from "./database";
import { Users } from "../resources/user";

// Create app
const app = nexs({
  dev: process.env.NODE_ENV === "development",
  session: {
    createStore: (session) =>
      new (MongoDBStoreFactory(session))({ uri, collection: "sessions" }),
  },
});

const commons = NEXSCommons();
commons.serve("/api/user", Users);
commons.attach(app);

(async () => {
  await connect();

  app.listen(3000, () => {
    console.log(`> Ready on http://localhost:3000`);
  });
})();
