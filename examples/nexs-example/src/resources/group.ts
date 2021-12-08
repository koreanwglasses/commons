import {
  ACCESS_ALLOW,
  ACCESS_DENY,
  ALLOW_ALL,
  Client,
  Collection,
  Model,
  Resource,
} from "@koreanwglasses/commons-core";
import Host, {
  memoryStore,
} from "@koreanwglasses/commons-memory-store-adapter";
import { UserCollection, User } from "./user";

export type Group = Resource<typeof GroupModel>;
export type GroupCollection = Collection<typeof GroupModel>;

interface GroupFields {
  id?: string;
  memberIds: string[];
}

function MEMBERS_ONLY(
  this: GroupCollection,
  target: Group | null,
  client: Client
) {
  if (!target) return ACCESS_DENY;
  return UserCollection.query(client, "current")
    .j((client) => client.field(this, "id"))
    .j((clientId) =>
      target
        .field(this, "memberIds")
        .p((memberIds) => memberIds.includes(clientId!))
        .p((result) => (result ? ACCESS_ALLOW : ACCESS_DENY))
    );
}

const GroupModel: Model<
  GroupFields,
  { members(): User[] },
  { _new(): string; _addMember(id: string): void; create(): void; join(): void }
> = {
  name: "Group",

  fields: {
    id: {
      type: String,
    },
    memberIds: {
      type: [String],
    },
  },

  queries: {
    members: {
      policy: MEMBERS_ONLY,
      requireTarget: true,
      get({ target }) {
        return target
          .field(this, "memberIds")
          .p((ids) => ids.map((id) => UserCollection.resource(id)));
      },
    },
  },

  actions: {
    _new: {
      exec() {
        const group = GroupStore.insert({ memberIds: [] });

        return {
          response: group.id,
          notify: this.handle(`${group.id}:`),
        };
      },
    },
    _addMember: {
      requireTarget: true,
      exec({ target }, id: string) {
        const group = GroupStore.findById(target.id);
        group.memberIds.push(id);
        GroupStore.save(group);

        return {
          notify: [
            ...target.handle(".memberIds"),
            ...UserCollection.resource(id).handle("/group?"),
          ],
        };
      },
    },
    create: {
      policy: ALLOW_ALL,
      async exec({ client }) {
        const id = await this.action(this, "_new");
        await this.resource(id).action(client, "join");
      },
    },
    join: {
      policy: ALLOW_ALL,
      requireTarget: true,
      async exec({ target, client }) {
        const clientUser = await UserCollection.query(client, "current").next();
        return target.action(this, "_addMember", clientUser.id!);
      },
    },
  },
};

export const GroupStore = memoryStore<GroupFields>("Group");
export const GroupCollection = Host.collection(GroupModel);
