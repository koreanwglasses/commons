import {
  ACCESS_ALLOW,
  ACCESS_DENY,
  ALLOW_ALL,
  Client,
  Collection,
  Model,
  NOT_FOUND,
  Resource,
} from "@koreanwglasses/commons-core";

import { MongoSupplier, store } from "../backend/database";
import { session } from "./session";
import { generateSlug } from "random-word-slugs";
import { User, Users, UserStore } from "./user";
import { Cascade } from "@koreanwglasses/cascade";
import { Game, Games } from "./game";

///////////////////////
// TYPE DECLARATIONS //
///////////////////////

export type Room = Resource<typeof model>;
export type Rooms = Collection<typeof model>;

type Fields = {
  _id: string;
  _hostId: string;
  _gameId: string;

  name: string;
  joinCode: string;
};

type Queries = {
  game(): Game | null;
  players: () => {
    user: User;
    isSelf: boolean;
    isHost: boolean;
  }[];
};

type Actions = {
  _init: () => string;
  _setHost: (userId?: string) => void;

  setName: (params: { name: string }) => void;
  newCode: () => void;
  startGame: () => void;

  join: (params: { joinCode: string }) => void;
  new: () => void;
};

type RoomModel = Model<Fields, Queries, Actions>;

//////////////
// POLICIES //
//////////////

function MEMBERS_ONLY(this: Rooms, target: Room | null, client: Client) {
  if (!target) return ACCESS_DENY;

  return Cascade.$({ clientState: session(client).queries.state.as(client) }).$(
    ($) =>
      $.clientState.room?.id && $.clientState.room.id === target.id
        ? ACCESS_ALLOW
        : ACCESS_DENY
  );
}

function HOST_ONLY(this: Rooms, target: Room | null, client: Client) {
  if (!target) return ACCESS_DENY;

  return Cascade.$({
    hostId: target.$._hostId,
    ...session(client).$,
  }).$(($) => ($.session.userId === $.hostId ? ACCESS_ALLOW : ACCESS_DENY));
}

//////////////////////
// MODEL DEFINITION //
//////////////////////

const model: RoomModel = {
  name: "Room",

  fields: {
    _id: {
      type: String,
    },
    _hostId: {
      type: String,
    },
    _gameId: {
      type: String,
    },

    name: {
      type: String,
      policy: MEMBERS_ONLY,
    },
    joinCode: {
      type: String,
      policy: MEMBERS_ONLY,
    },
  },

  queries: {
    game: {
      policy: MEMBERS_ONLY,
      async get({ target }) {
        return Cascade.$({ gameId: target.$._gameId }).$(($) =>
          typeof $.gameId === "string" ? Games.$[$.gameId] : null
        );
      },
    },
    players: {
      policy: MEMBERS_ONLY,
      autoFetch: true,
      async get({ target, client }) {
        const records = await UserStore.find({ _roomId: target.id }).exec();
        const memberIds = records.map((record) => record.id as string);

        return Cascade.$({
          _hostId: target.$._hostId,
          ...session(client).$,
        }).$(({ _hostId, session }) =>
          memberIds.map((id) => ({
            user: Users.$[id],
            isSelf: session.userId === id,
            isHost: id === _hostId,
          }))
        );
      },
    },
  },

  actions: {
    _init: {
      isStatic: true,
      async exec() {
        const room = await RoomStore.create({
          joinCode: await generateRoomCode(),
          memberIds: [],
        });
        return room.id;
      },
    },
    _setHost: {
      async exec({ target }, userId) {
        let _hostId: string;

        if (userId) {
          _hostId = userId;
        } else {
          const newHost = await UserStore.findOne({
            _roomId: target.id,
          }).exec();
          _hostId = newHost?.id;
        }

        if (!_hostId) return;

        await RoomStore.findByIdAndUpdate(target.id, { _hostId }).exec();
        return { notify: target.handle("._hostId") };
      },
    },

    setName: {
      policy: HOST_ONLY,
      async exec({ target }, { name }) {
        await RoomStore.findByIdAndUpdate(target.id, { name }).exec();
        return { notify: target.handle(".name") };
      },
    },
    newCode: {
      policy: HOST_ONLY,
      async exec({ target }) {
        await RoomStore.findByIdAndUpdate(target.id, {
          joinCode: await generateRoomCode(),
        }).exec();
        return { notify: target.handle(".joinCode") };
      },
    },
    startGame: {
      policy: HOST_ONLY,
      async exec({ target }) {
        const playerIds = (
          await UserStore.find({ _roomId: target.id }).exec()
        )?.map((user) => user.id as string);

        const _gameId = await Games.actions._init(playerIds);
        await RoomStore.findByIdAndUpdate(target.id, {
          _gameId,
        }).exec();

        return { notify: target.handle("._gameId") };
      },
    },

    join: {
      policy: ALLOW_ALL,
      isStatic: true,
      async exec({ client }, { joinCode }) {
        const roomId = (await RoomStore.findOne({ joinCode }).exec())?.id;
        if (!roomId) throw NOT_FOUND();

        const numMembers = await UserStore.count({ _roomId: roomId }).exec();
        if (numMembers >= 6) throw new Error("Room is full");

        const { userId } = await session(client).$.session.next();
        await Users.$[userId].actions._setRoom(roomId);
      },
    },
    new: {
      policy: ALLOW_ALL,
      isStatic: true,
      async exec({ client }) {
        const { userId } = await session(client).$.session.next();
        const username = await Users.$[userId].$.username.next();

        const roomId = await this.actions._init();

        await this.$[roomId].actions.setName({ name: `${username}'s Room` });
        await this.$[roomId].actions._setHost(userId);
        await Users.$[userId].actions._setRoom(roomId);
      },
    },
  },
};

////////////////////
// STATIC HELPERS //
////////////////////

async function generateRoomCode() {
  let joinCode: string;
  let maxTries = 5;
  do {
    joinCode = generateSlug();
    if (!(await RoomStore.exists({ joinCode }))) return joinCode;

    maxTries--;
    if (maxTries <= 0) throw new Error("Failed to generate a group code");
  } while (true);
}

///////////
// STORE //
///////////

const RoomStore = store(model);
export const Rooms = MongoSupplier.collection(model);
