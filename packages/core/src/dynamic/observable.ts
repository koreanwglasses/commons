export type Subscriber<T = undefined, E = any> = (error: E | null, value?: T) => void;
export type Subscription = { unsubscribe(): void; };

export abstract class Observable<T = undefined, E = any> {
  protected subscribers: Subscriber<T, E>[] = [];

  subscribe(subscriber: Subscriber<T, E>): Subscription {
    this.subscribers.push(subscriber);
    return {
      unsubscribe: () => {
        const i = this.subscribers.indexOf(subscriber);
        if (i !== -1)
          this.subscribers.splice(i, 1);

        if (this.subscribers.length === 0)
          this.close();
      },
    };
  }

  protected notify(value: T) {
    this.subscribers.forEach((sub) => sub(null, value));
  }

  protected error(error: E) {
    this.subscribers.forEach((sub) => sub(error));
  }

  abstract invalidate(): void;

  abstract close(): void;
}

