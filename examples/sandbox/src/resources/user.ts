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
declare module "@koreanwglasses/commons-core" {
  interface Client {
    sessionId: string;
  }
}
import { MongoDatabase, store } from "../backend/database";

export type User = Resource<typeof model>;
export type UserCollection = Collection<typeof model>;

function ALLOW_SELF(this: UserCollection, target: User | null, client: Client) {
  if (!target) return ACCESS_DENY;
  return this.query(client, "current").p((client) =>
    client.id === target.id ? ACCESS_ALLOW : ACCESS_NEVER
  );
}

interface UserFields {
  _sessionId: string;
  _id: string;

  username: string | null;
}

const model: Model<
  UserFields,
  {
    current(): User;
  },
  {
    setUsername(body: { username: string }): void;
  }
> = {
  name: "User",

  fields: {
    _sessionId: {
      type: String,
    },
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
        const user = await UserStore.findOneAndUpdate(
          { _sessionId: client.sessionId },
          {},
          { upsert: true, new: true, projection: { _id: 1 } }
        )
          .lean()
          .exec();

        return this.resource(String(user._id));
      },
    },
  },

  actions: {
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

export const UserStore = store(model);
export const UserCollection = MongoDatabase.collection(model);
