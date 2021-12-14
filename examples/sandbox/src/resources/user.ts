import { Cascade } from "@koreanwglasses/cascade";
import {
  ACCESS_ALLOW,
  ACCESS_DENY,
  ACCESS_NEVER,
  ALLOW_ALL,
  Client,
  Collection,
  Model,
  Resource,
} from "@koreanwglasses/commons-core";

import { MongoSupplier, store } from "../backend/database";
import { Room, Rooms } from "./room";
import { ValidationError } from "./lib/error";
import { session } from "./session";
import { Game, Games, GameStore } from "./game";

///////////////////////
// TYPE DECLARATIONS //
///////////////////////

export type User = Resource<UserModel>;
export type Users = Collection<UserModel>;

type Fields = {
  _id: string;
  _roomId: string | null;
  _lastDisconnect: number | null;

  username: string | null;
};

type Queries = {
  isConnected(): boolean;
};

type Actions = {
  _init(): string;
  _setRoom(roomId: string | null): void;
  _reconnect(): void;
  _disconnect(date: number): void;

  setUsername(body: { username: string }): void;
  leaveRoom(): void;
};

type UserModel = Model<Fields, Queries, Actions>;

////////////
// CONSTS //
////////////

const DISCONNECT_TIMEOUT = 1000 * 30;

//////////////
// POLICIES //
//////////////

function ALLOW_SELF(this: Users, target: User | null, client: Client) {
  if (!target) return ACCESS_DENY;
  return Cascade.$({ session: session(client).$.session }).$(($) =>
    $.session.userId === target.id ? ACCESS_ALLOW : ACCESS_NEVER
  );
}

function ROOM_ONLY(this: Users, target: User | null, client: Client) {
  if (!target) return ACCESS_DENY;

  return Cascade.$({
    clientState: session(client).queries.state.as(client),
    targetRoomId: target.$._roomId,
  })
    .$(($) =>
      $.clientState.room?.id && $.clientState.room.id === $.targetRoomId
        ? ACCESS_ALLOW
        : ACCESS_DENY
    );
}

//////////////////////
// MODEL DEFINITION //
//////////////////////

const model: UserModel = {
  name: "User",

  fields: {
    _id: {
      type: String,
    },
    _roomId: {
      type: String,
    },
    _lastDisconnect: {
      type: Number,
    },

    username: {
      type: String,
      policy: ALLOW_ALL,
    },
  },

  queries: {
    isConnected: {
      policy: ROOM_ONLY,
      autoFetch: true,
      get({ target }) {
        return Cascade.$({ lastDisconnect: target.$._lastDisconnect }).$(
          ($) => !$.lastDisconnect
        );
      },
    },
  },

  actions: {
    _init: {
      isStatic: true,
      async exec() {
        const userId = (await UserStore.create({})).id;
        return userId;
      },
    },
    _setRoom: {
      async exec({ target }, _roomId) {
        const { _roomId: prevRoomId } =
          (await UserStore.findByIdAndUpdate(target.id, {
            _roomId,
          }).exec()) ?? {};

        if (prevRoomId) {
          const hostId = await Rooms.$[prevRoomId].$._hostId.next();
          if (target.id === hostId) {
            Rooms.$[prevRoomId].actions._setHost();
          }
        }

        return {
          notify: [
            ...target.handle("._roomId"),
            ...(prevRoomId ? Rooms.$[prevRoomId].handle("/players?") : []),
          ],
        };
      },
    },
    _reconnect: {
      async exec({ target }) {
        await UserStore.findByIdAndUpdate(target.id, {
          _lastDisconnect: null,
        }).exec();

        return {
          notify: target.handle("._lastDisconnect"),
        };
      },
    },
    _disconnect: {
      async exec({ target }, _lastDisconnect) {
        await UserStore.findByIdAndUpdate(target.id, {
          _lastDisconnect,
        }).exec();

        checkDisconnectedUser(target, _lastDisconnect);

        return {
          notify: target.handle("._lastDisconnect"),
        };
      },
    },

    setUsername: {
      policy: ALLOW_SELF,
      async exec({ target }, { username }) {
        if (!/^[0-9a-zA-Z_$]{4,}$/.exec(username))
          throw new ValidationError(
            "Username must be at least 4 characters and contain only digits, letters, _, or $"
          );

        await UserStore.findByIdAndUpdate(target.id, {
          $set: { username },
        }).exec();

        return { notify: target.handle(".username") };
      },
    },
    leaveRoom: {
      policy: ALLOW_SELF,
      async exec({ target }) {
        await target.actions._setRoom(null);
      },
    },
  },
};

////////////////////
// STATIC HELPERS //
////////////////////

function checkDisconnectedUser(target: User, lastDisconnect: number) {
  setTimeout(async () => {
    const lastDisconnect = await target.$._lastDisconnect.next();
    if (lastDisconnect && lastDisconnect + DISCONNECT_TIMEOUT <= Date.now()) {
      target.actions.leaveRoom();
    }
  }, DISCONNECT_TIMEOUT + lastDisconnect - Date.now());
}

///////////
// STORE //
///////////

export const UserStore = store(model);
export const Users = MongoSupplier.collection(model);
