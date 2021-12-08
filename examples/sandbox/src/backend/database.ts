import { Database, Fields, Model, Store } from "@koreanwglasses/commons-core";
import mongoose from "mongoose";
// mongoose.set("debug", true);

export const store = <M extends Model>(model: M): mongoose.Model<Fields<M>> => {
  if (mongoose.models[model.name]) return mongoose.models[model.name];

  const schemaArgs = Object.fromEntries(
    Object.entries(model.fields ?? {})
      .filter(([name]) => name !== "_id")
      .map(([name, field]) => [name, (field as Fields<M>[string]).type])
  );

  const schema = new mongoose.Schema(schemaArgs);

  return mongoose.model(model.name, schema);
};

const adapter = <M extends Model>(
  store: mongoose.Model<Fields<M>>
): Store<M> => {
  return {
    async findById(id, fields) {
      const result = await store
        .findById(id, Object.fromEntries(fields.map((name) => [name, 1])))
        .lean()
        .exec();

      return result;
    },
  };
};

export const connect = async () => {
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const name = process.env.DB_NAME;
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT;
  const uri = `mongodb://${user}:${password}@${host}:${port}/${name}`;

  return await mongoose.connect(uri);
};

export const MongoDatabase = new Database({
  createStore(model) {
    return adapter(store(model));
  },
});
