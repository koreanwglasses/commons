import { Cascade, DEFER_RESULT } from "@koreanwglasses/cascade";
import {
  ALLOW_ALL,
  Collection,
  Model,
} from "@koreanwglasses/commons-core";
import { Game, Games } from "./game";
import { Room, Rooms } from "./room";
import { session } from "./session";
import { User, Users, UserStore } from "./user";

declare module "@koreanwglasses/commons-core" {
  interface Client {
    sessionId: string;
  }
}

///////////////////////
// TYPE DECLARATIONS //
///////////////////////

export type App = Collection<AppModel>;

export type AppState = { user: User; room: Room | null; game: Game | null };

type Queries = {
  state(): AppState;
};

type AppModel = Model<{}, Queries, {}>;

//////////////////////
// MODEL DEFINITION //
//////////////////////

const model: AppModel = {
  name: "App",

  queries: {
    state: {
      policy: ALLOW_ALL,
      isStatic: true,
      get({ client }) {
        return Cascade.$({ ...session(client).$ })
          .$(async ($) => {
            if (
              !$.session.userId ||
              !(await UserStore.exists({ _id: $.session.userId }))
            ) {
              const userId = await Users.actions._init();
              session(client).actions._update({ userId });
              throw DEFER_RESULT;
            } else {
              const user = Users.$[$.session.userId];
              return $({ user, roomId: user.$._roomId });
            }
          })
          .$(($) => {
            const room =
              typeof $.roomId === "string" ? Rooms.$[$.roomId] : null;
            return $({ room, gameId: room?.$._gameId, roomId: null });
          })
          .$(($) => {
            const game =
              typeof $.gameId === "string" ? Games.$[$.gameId] : null;
            return { user: $.user, room: $.room, game };
          });
      },
    },
  },
};

///////////
// STORE //
///////////

export const App = new Collection(model, {
  findById() {
    throw new Error("App is a static collection");
  },
});
