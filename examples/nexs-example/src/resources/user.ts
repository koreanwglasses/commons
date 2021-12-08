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
import Host, {
  memoryStore,
} from "@koreanwglasses/commons-memory-store-adapter";
import { GroupCollection, Group, GroupStore } from "./group";

declare module "@koreanwglasses/commons-core" {
  interface Client {
    sessionId: string;
  }
}

export type User = Resource<typeof UserModel>;
export type UserCollection = Collection<typeof UserModel>;

function ALLOW_SELF(this: UserCollection, target: User | null, client: Client) {
  if (!target) return ACCESS_DENY;
  return this.query(client, "current").p((client) =>
    client.id === target.id ? ACCESS_ALLOW : ACCESS_NEVER
  );
}

interface UserFields {
  _sessionId: string;

  id?: string;
  username: string | null;
}

const UserModel: Model<
  UserFields,
  {
    current(): User;
    group(): Group | null;
  },
  {
    _new(client: Client): string;
    setUsername(body: { username: string }): void;
  }
> = {
  name: "User",

  policy() {
    return ACCESS_ALLOW;
  },

  fields: {
    _sessionId: {
      type: String,
    },

    id: {
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
        const user = UserStore.filter(
          (user) => user._sessionId === client.sessionId
        )[0];
        if (user) return this.resource(user.id);

        const id = await this.action(this, "_new", client);
        return this.resource(id);
      },
    },
    group: {
      policy: ALLOW_SELF,
      requireTarget: true,
      fetch: true,
      get({ target }) {
        const group = GroupStore.filter((group) =>
          group.memberIds.includes(target.id)
        )[0];
        if (!group) return null;
        return GroupCollection.resource(group.id);
      },
    },
  },

  actions: {
    _new: {
      exec(_, client: Client) {
        const user = UserStore.insert({
          _sessionId: client.sessionId,
          username: null,
        });
        return { response: user.id, notify: this.handle(`${user.id}:`) };
      },
    },
    setUsername: {
      policy: ALLOW_SELF,
      requireTarget: true,
      exec({ target }, { username }) {
        const user = UserStore.findById(target.id);
        user.username = username;
        UserStore.save(user);

        return { notify: target.handle(".username") };
      },
    },
  },
};

export const UserStore = memoryStore<UserFields>("User");
export const UserCollection = Host.collection(UserModel);
