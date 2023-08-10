import { writable, type Unsubscriber, type Writable } from 'svelte/store';
import NDK, { NDKConstructorParams, NDKEvent, NDKFilter, NDKSubscriptionOptions, NDKRepost } from "@nostr-dev-kit/ndk";

type ClassWithConvertFunction<T> = {
    from: (event: NDKEvent) => NDKEvent;
};

type UnsubscribableStore<T> = Writable<T> & {
    unsubscribe: Unsubscriber;
    onEose: (cb: () => void) => void;
};

export type NDKEventStore<T> = UnsubscribableStore<T[]>;

class NDKSvelte extends NDK {
    constructor(opts?: NDKConstructorParams) {
        super(opts);
    }

    private createEventStore<T>(): UnsubscribableStore<T[]> {
        const store = writable<T[]>([]);
        return {
            set: store.set,
            update: store.update,
            subscribe: store.subscribe,
            unsubscribe: () => {},
            onEose: (cb) => {}
        };
    }

    private handleEvent<T>(event: NDKEvent, eventIds: Set<string>, events: T[], store: UnsubscribableStore<T[]>, klass?: ClassWithConvertFunction<T>) {
        let e: NDKEvent | T = event;
        if (klass) {
            e = klass.from(event);
        }
        e.ndk = this;

        const id = event.tagId();
        if (eventIds.has(id)) return;
        eventIds.add(id);
        events.push(e as unknown as T);
        store.set(events);
    }

    public storeSubscribeWithReposts<T>(
        filters: NDKFilter | NDKFilter[],
        repostsFilter: NDKFilter,
        opts?: NDKSubscriptionOptions,
        klass?: ClassWithConvertFunction<T>
    ): NDKEventStore<T> {
        const sub = this.subscribe(filters, opts);
        const repostsSub = this.subscribe(repostsFilter, opts);
        const eventIds: Set<string> = new Set();
        const events: T[] = [];
        const store = this.createEventStore<T>();

        store.unsubscribe = () => {
            sub.stop();
            repostsSub.stop();
        };

        store.onEose = (cb) => {
            sub.on('eose', cb);
        };

        repostsSub.on('event', (repostEvent: NDKEvent) => {
            const _repostEvent = NDKRepost.from(repostEvent);
            _repostEvent.ndk = this;

            _repostEvent.repostedEvents(klass).then((fetchedEvents: unknown[]) => {
                for (const e of fetchedEvents) {
                    if (e instanceof NDKEvent) {
                        this.handleEvent(e, eventIds, events, store, klass);
                    }
                }
            });
        });

        sub.on('event', (event: NDKEvent) => {
            this.handleEvent(event, eventIds, events, store, klass);
        });

        return store;
    }

    public storeSubscribe<T>(
        filters: NDKFilter | NDKFilter[],
        opts?: NDKSubscriptionOptions,
        klass?: ClassWithConvertFunction<T>
    ): NDKEventStore<T> {
        const sub = this.subscribe(filters, opts);
        const eventIds: Set<string> = new Set();
        const events: T[] = [];
        const store = this.createEventStore<T>();

        store.unsubscribe = () => {
            sub.stop();
        };

        store.onEose = (cb) => {
            sub.on('eose', cb);
        };

        sub.on('event', (event: NDKEvent) => {
            this.handleEvent(event, eventIds, events, store, klass);
        });

        return store;
    }
}

export default NDKSvelte;
