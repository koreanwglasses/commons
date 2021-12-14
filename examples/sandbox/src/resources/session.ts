import { Cascade, DEFER_RESULT } from "@koreanwglasses/cascade";
import {
  ALLOW_ALL,
  Client,
  Collection,
  Model,
  Resource,
} from "@koreanwglasses/commons-core";
import { MongoSupplier, store } from "../backend/database";
import { Game, Games } from "./game";
import { Room, Rooms } from "./room";
import { User, Users, UserStore } from "./user";

declare module "@koreanwglasses/commons-core" {
  interface Client {
    sessionId: string;
  }
}

///////////////////////
// TYPE DECLARATIONS //
///////////////////////

export type Session = Resource<SessionModel>;
export type Sessions = Collection<SessionModel>;

export type ClientState = { user: User; room: Room | null; game: Game | null };

type Fields = {
  _id: string;
  session: {
    userId: string;
  };
};

type Queries = {
  state(): ClientState;
};

type Actions = {
  _update(data: Partial<Fields["session"]>): void;
};

type SessionModel = Model<Fields, Queries, Actions>;

//////////////
// POLICIES //
//////////////

//////////////////////
// MODEL DEFINITION //
//////////////////////

const model: SessionModel = {
  name: "Session",

  fields: {
    _id: {
      type: String,
    },
    session: {
      type: {
        userId: String,
      },
    },
  },

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

  actions: {
    _update: {
      async exec({ target }, data) {
        await SessionStore.findByIdAndUpdate(
          target.id,
          Object.fromEntries(
            Object.entries(data).map(([key, value]) => [
              `session.${key}`,
              value,
            ])
          )
        ).exec();

        return {
          notify: target.handle(`.session`),
        };
      },
    },
  },
};

////////////////////
// STATIC HELPERS //
////////////////////

export function session(client: Client) {
  return Sessions.$[client.sessionId];
}

///////////
// STORE //
///////////

const SessionStore = store(model, true);
export const Sessions = MongoSupplier.collection(model);
