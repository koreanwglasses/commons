import "reflect-metadata";

export function resource(name: string) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    return class extends constructor {

    };
  };
}

export function storeType(type: any) {
  return Reflect.metadata("store-type", type);
}