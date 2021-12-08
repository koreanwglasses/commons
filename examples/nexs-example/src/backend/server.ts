import nexs from "@koreanwglasses/nexs-server";
import { GroupCollection } from "../resources/group";
import { UserCollection } from "../resources/user";
import NEXSCommons from "@koreanwglasses/commons-nexs-server";

// Create app
const app = nexs({ dev: process.env.NODE_ENV === "development" });

const commons = NEXSCommons();
commons.serve("/api/user", UserCollection);
commons.serve("/api/group", GroupCollection);
commons.attach(app);

app.listen(3000, () => {
  console.log(`> Ready on http://localhost:3000`);
});
