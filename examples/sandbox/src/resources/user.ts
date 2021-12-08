import { DEFER_RESULT } from "@koreanwglasses/cascade";
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
import e from "express";

import { MongoDatabase, store } from "../backend/database";
import { sessionData, session, SessionStore } from "./session";

///////////////////////
// TYPE DECLARATIONS //
///////////////////////

export type User = Resource<typeof model>;
export type Users = Collection<typeof model>;

interface UserFields {
  _id: string;
  username: string | null;
}

//////////////
// POLICIES //
//////////////

function ALLOW_SELF(this: Users, target: User | null, client: Client) {
  if (!target) return ACCESS_DENY;
  return sessionData(client).p(({ userId }) =>
    userId === target.id ? ACCESS_ALLOW : ACCESS_NEVER
  );
}

//////////////////////
// MODEL DEFINITION //
//////////////////////

const model: Model<
  UserFields,
  {
    current(): User;
  },
  {
    _init(client: Client): void;
    setUsername(body: { username: string }): void;
  }
> = {
  name: "User",

  fields: {
    _id: {
      type: String,
    },
    username: {
      type: String,
      policy: ALLOW_ALL,
    },
  },

  queries: {
    current: {
      policy: ALLOW_ALL,
      async get({ client }) {
        return sessionData(client).p(({ userId }) => {
          if (userId) return this.resource(userId);
          else {
            this.action(this, "_init", client);
            throw DEFER_RESULT;
          }
        });
      },
    },
  },

  actions: {
    _init: {
      async exec(_, client) {
        const userId = (await UserStore.create({})).id;
        session(client).action(this, "update", { userId });
      },
    },
    setUsername: {
      policy: ALLOW_SELF,
      requireTarget: true,
      async exec({ target }, { username }) {
        await UserStore.findByIdAndUpdate(target.id, {
          $set: { username },
        }).exec();

        return { notify: target.handle(".username") };
      },
    },
  },
};

//////////////////
// MAIN EXPORTS //
//////////////////

export const UserStore = store(model);
export const Users = MongoDatabase.collection(model);
