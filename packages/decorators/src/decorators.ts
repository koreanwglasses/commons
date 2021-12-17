import { Cascade } from "@koreanwglasses/cascade";
import "reflect-metadata";
import {
  ALLOW_ALL,
  Client,
  Policy,
  StaticPolicy,
} from "@koreanwglasses/commons-core";

function getPropertyType(descriptor?: PropertyDescriptor) {
  return descriptor?.get
    ? "accessor"
    : descriptor?.value
    ? "method"
    : "property";
}

const properties = new Map<any, any>();

function model(name: string) {
  return function (constructor: Function) {
    const instanceProperties = properties.get(constructor.prototype);
    const staticProperties = properties.get(constructor);

    const model = { name, fields: {}, queries: {}, actions: {} } as any;

    Object.entries(instanceProperties).forEach(([key, value]) => {
      if ((value as any)._type === "field") model.fields[key] = value;
      if ((value as any)._type === "query") model.queries[key] = value;
      if ((value as any)._type === "action") model.actions[key] = value;
    });

    Object.entries(staticProperties).forEach(([key, value]) => {
      (value as any).isStatic = true;
      if ((value as any)._type === "field")
        throw new Error("Fields must not be static");
      if ((value as any)._type === "query") model.queries[key] = value;
      if ((value as any)._type === "action") model.actions[key] = value;
    });

    console.log(model);
  };
}

function store(type: unknown) {
  return function (target: any, key: string) {
    const model = properties.get(target) ?? {};
    const property = (model[key] ??= {});

    property._type = "field";
    property.type = type;
    properties.set(target, model);
  };
}

function query(target: any, key: string, descriptor: PropertyDescriptor) {
  if (getPropertyType(descriptor) === "property")
    throw new Error(
      "Query decorator can only be applied to methods or accessors"
    );

  const model = properties.get(target) ?? {};

  (model[key] ??= {})._type = "query";
  model[key]._func = descriptor.get ?? descriptor.value;

  if (getPropertyType(descriptor) === "accessor") model[key].autoFetch = true;

  properties.set(target, model);
}

function action(target: any, key: string, descriptor: PropertyDescriptor) {
  if (getPropertyType(descriptor) !== "method")
    throw new Error("Action decorator can only be applied to methods");

  const model = properties.get(target) ?? {};

  (model[key] ??= {})._type = "action";
  model[key]._func = descriptor.value;

  properties.set(target, model);
}

function policy(policy: Policy<any> | StaticPolicy<any>) {
  return function (target: any, key: string) {
    const model = properties.get(target) ?? {};
    (model[key] ??= {}).policy = policy;
    properties.set(target, model);
  };
}

abstract class Model {
  [key: string]:
    | undefined
    | Cascade<any>
    | ((client: Client, ...params: any[]) => Cascade<any>);
}

@model("Test")
class Test extends Model {
  @store(String)
  field1?: Cascade<string>;

  @policy(ALLOW_ALL)
  @query
  static get field2() {
    return Cascade.const("field2");
  }

  @action
  field3(client: Client) {
    return Cascade.const("field2");
  }

  @action
  static field4() {
    return Cascade.const("field3");
  }
}

new Test();
