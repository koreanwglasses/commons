import { Database } from "@koreanwglasses/commons-core";
import { v4 as uuid } from "uuid";

const globalStore: Record<string, any> = ((
  global as any
)._commonsMemoryStore ??= {});

export const memoryStore = <T = any>(name: string) => {
  const store = (globalStore[name] ??= {}) as Record<
    string,
    T & { id: string }
  >;

  return {
    findById(id: string, fields?: any[]): T & { id: string } {
      return Object.fromEntries(
        Object.entries(store[id]).filter(
          ([key, value]) => fields?.includes(key) ?? true
        )
      ) as any;
    },

    filter(cb: (item: T & { id: string }) => boolean) {
      return Object.values(store).filter(cb);
    },

    insert(item: T) {
      const id = uuid();
      return (store[id] = Object.assign(item, { id }));
    },

    save(item: T & { id: string }) {
      if (!item.id) {
        console.error(
          "Item does not have an id. Did you forget to include `id` as an argument to findById?"
        );
        return;
      }
      store[item.id] = item;
    },

    delete(id: string) {
      delete store[id];
    },
  };
};

export const database = new Database({
  createStore: (model) => memoryStore(model.name),
});
