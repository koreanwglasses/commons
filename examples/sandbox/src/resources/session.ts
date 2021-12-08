import {
  Client,
  Collection,
  Model,
  Resource,
} from "@koreanwglasses/commons-core";
import { MongoDatabase, store } from "../backend/database";

declare module "@koreanwglasses/commons-core" {
  interface Client {
    sessionId: string;
  }
}

///////////////////////
// TYPE DECLARATIONS //
///////////////////////

export type Session = Resource<typeof model>;
export type Sessions = Collection<typeof model>;

interface SessionFields {
  _id: string;
  session: {
    userId: string;
  };
}

//////////////////////
// MODEL DEFINITION //
//////////////////////

const model: Model<
  SessionFields,
  {},
  {
    update(data: Partial<SessionFields["session"]>): void;
  }
> = {
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

  actions: {
    update: {
      requireTarget: true,
      async exec({ target }, data) {
        await SessionStore.findByIdAndUpdate(
          target.id,
          Object.fromEntries(
            Object.entries(data).map(([key, value]) => [
              `session.${key}`,
              value,
            ])
          ),
          { new: true }
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
  return Sessions.resource(client.sessionId);
}

export function sessionData(client: Client) {
  return Sessions.resource(client.sessionId).field(Sessions, "session");
}

//////////////////
// MAIN EXPORTS //
//////////////////

export const SessionStore = store(model, true);
export const Sessions = MongoDatabase.collection(model);
