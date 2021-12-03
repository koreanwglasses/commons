import deepEqual from "deep-equal";
import { Whenever } from "../types";
import { Observable, Subscription, Subscriber } from "./observable";


export interface Result<T, E = any> {
  value?: T;
  error?: E;
  dependencies: Observable[];
}

export class DynamicQuery<T = any, E = any> extends Observable<T> {
  protected subscriptions: Subscription[] = [];

  constructor(private compute: () => Whenever<Result<T, E>>) {
    super();
    this.invalidate();
  }

  private isValid = false;
  subscribe(subscriber: Subscriber<T, any>): Subscription {
    if (this.isValid)
      subscriber(this.prevError, this.prevValue);
    return super.subscribe(subscriber);
  }

  private prevValue?: T;
  private prevError?: E;
  async invalidate() {
    this.isValid = false;

    const { value, error, dependencies } = await this.compute();

    if (error && !deepEqual(error, this.prevError)) {
      this.subscribers.forEach((sub) => sub(error));
    }

    if (value && !deepEqual(value, this.prevValue)) {
      this.subscribers.forEach((sub) => sub(null, value));
    }

    this.prevError = error;
    this.prevValue = value;
    this.isValid = true;

    // Subscribe to new dependencies before unsubscribing from old ones
    // to prevent dependencies from closing while waiting to re-subscribe
    const subscriptions = [...new Set(dependencies)].map((dep) => dep.subscribe(() => this.invalidate())
    );

    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions = subscriptions;
  }

  close() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }
}
