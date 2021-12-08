import nexs from "@koreanwglasses/nexs-server";
import { UserCollection } from "../resources/user";
import NEXSCommons from "@koreanwglasses/commons-nexs-server";
import { connect } from "./database";

// Create app
const app = nexs({ dev: process.env.NODE_ENV === "development" });

const commons = NEXSCommons();
commons.serve("/api/user", UserCollection);
commons.attach(app);

(async () => {
  await connect();

  app.listen(3000, () => {
    console.log(`> Ready on http://localhost:3000`);
  });
})();
