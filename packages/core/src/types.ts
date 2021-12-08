import { Cascade } from "@koreanwglasses/cascade";

export type Whenever<T> = T | Promise<T>;

export type TypeAsValue<T> = T extends string
  ? StringConstructor
  : T extends number
  ? NumberConstructor
  : T extends boolean
  ? BooleanConstructor
  : T extends object
  ? { [K in keyof T]: TypeAsValue<T[K]> }
  : T;

export type TypeFromValue<T> = T extends StringConstructor
  ? string
  : T extends NumberConstructor
  ? number
  : T extends BooleanConstructor
  ? boolean
  : T extends object
  ? { [K in keyof T]: TypeFromValue<T[K]> }
  : T;

export type FuncRecord = Record<string, (...args: any) => any>;

export type Result<T> = Whenever<T | Cascade<T>>;
