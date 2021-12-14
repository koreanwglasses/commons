import { Model, Fields } from ".";
import { Whenever } from "./types";
import { Collection } from "./collection";

export interface Store<M extends Model> {
  /**
   * Searches for a record/document with the specified id, and returns the
   * specified fields. If no record exists, return null.
   */
  findById(
    id: string,
    fields: (keyof Fields<M> & string)[]
  ): Whenever<Partial<Fields<M>> | null>;

  /**
   * Update the record/document with specified id and values. Throw
   * an error if the update fails
   */
  update?(id: string, values: Partial<Fields<M>>): Whenever<void>;
}

export interface StoreFactory {
  createStore<M extends Model>(model: M): Whenever<Store<M>>;
}

export class Supplier {
  private collections: Record<string, Collection<any>> = {};

  constructor(private storeFactory: StoreFactory) {}

  collection<M extends Model>(model: M): Collection<M> {
    return (this.collections[model.name] ??= new Collection<M>(
      model,
      this.storeFactory.createStore(model)
    ));
  }
}
