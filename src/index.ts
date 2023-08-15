import { writable, type Unsubscriber, type Writable } from 'svelte/store';
import NDK, { NDKConstructorParams, NDKEvent, NDKFilter, NDKSubscriptionOptions, NDKRepost, NDKSubscription, NDKKind } from "@nostr-dev-kit/ndk";

/**
 * Type for NDKEvent classes that have a static `from` method like NDKHighlight.
 */
type ClassWithConvertFunction<T extends NDKEvent> = {
    from: (event: NDKEvent) => T;
};

type ExtendedBaseType<T extends NDKEvent> = T & {
    repostedByEvents?: NDKEvent[];
}

export type NDKEventStore<T extends NDKEvent> = Writable<ExtendedBaseType<T>[]> & {
    filters: NDKFilter[] | undefined;
    refCount: number;
    startSubscription: () => void;
    unsubscribe: Unsubscriber;
    onEose: (cb: () => void) => void;
    ref: () => number;
    unref: () => number;
};

type NDKSubscribeOptions = NDKSubscriptionOptions & {
    /**
     * Whether the subscription should start when the
     * store is created. Defaults to true.
     */
    autoStart?: boolean;

    /**
     * Reposts filters
     */
    repostsFilters?: NDKFilter[];
};

class NDKSvelte extends NDK {
    constructor(opts?: NDKConstructorParams) {
        super(opts);
    }

    private createEventStore<T extends NDKEvent>(
        filters?: NDKFilter[],
    ): NDKEventStore<T> {
        const store = writable<T[]>([]) as NDKEventStore<T>;
        return {
            refCount: 0,
            filters,
            set: store.set,
            update: store.update,
            subscribe: store.subscribe,
            unsubscribe: () => {},
            onEose: (cb) => {},
            startSubscription: () => { throw new Error('not implemented') },
            ref: () => {
                store.refCount++;
                if (store.refCount === 1) {
                    store.startSubscription();
                }
                return store.refCount;
            },
            unref: () => {
                if (--store.refCount === 0) {
                    store.unsubscribe();
                }
                return store.refCount;
            }
        };
    }

    private eventIsRepost(event: NDKEvent): boolean {
        return [
            NDKKind.Repost,
            NDKKind.GenericRepost
        ].includes(event.kind!);
    }

    public storeSubscribe<T extends NDKEvent>(
        filters: NDKFilter | NDKFilter[],
        opts?: NDKSubscribeOptions,
        klass?: ClassWithConvertFunction<T>
    ): NDKEventStore<ExtendedBaseType<T>> {
        let sub: NDKSubscription | undefined = undefined;
        const eventIds: Set<string> = new Set();
        const events: ExtendedBaseType<T>[] = [];
        const store = this.createEventStore<ExtendedBaseType<T>>(
            Array.isArray(filters) ? filters : [filters]
        );
        const autoStart = opts?.autoStart ?? true;

        /**
         * Called when a repost event is identified. It either adds the repost event
         * to the existing reposted events or fetches the reposted events and adds
         * them to the store
         * @param event Repost event (kind:6 or kind:16)
         */
        const handleEventReposts = (event: NDKEvent) => {
            const _repostEvent = NDKRepost.from(event);
            _repostEvent.ndk = this;

            const addRepostToExistingEvent = (repostedEvent: ExtendedBaseType<T>) => {
                // If we already have the reposted event, add it to the repost event
                if (repostedEvent.repostedByEvents) {
                    repostedEvent.repostedByEvents.push(event);
                } else {
                    repostedEvent.repostedByEvents = [event];
                }

                store.set(events);
            }

            for (const repostedEventId of _repostEvent.repostedEventIds()) {
                const repostedEvent = events.find((e) => e.id === repostedEventId);

                if (repostedEvent) {
                    addRepostToExistingEvent(repostedEvent);
                } else {
                    // If we don't have the reposted event, fetch it and add it to the store
                    _repostEvent.repostedEvents(klass).then((fetchedEvents: unknown[]) => {
                        for (const e of fetchedEvents) {
                            if (e instanceof NDKEvent) {
                                handleEvent(e);
                            }
                        }
                    });
                }
            }
        };

        /**
         *
         * @param event Event to handle
         * @param klass Class to convert the event to
         * @param repostEvent Repost event this event is a repost of
         * @returns
         */
        const handleEvent = (event: NDKEvent) => {
            // if we have a repostFilters and this event is a repost
            if (store.filters && this.eventIsRepost(event)) {
                // Check if we already have the repost event
                handleEventReposts(event);
                return;
            }

            let e = event;
            if (klass) {
                e = klass.from(event);
            }
            e.ndk = this;

            const id = event.tagId();
            if (eventIds.has(id)) return;
            eventIds.add(id);

            const index = events.findIndex((e) => e.created_at! < event.created_at!);
            if (index === -1) {
                events.push(e as unknown as T);
            } else {
                events.splice(index === -1 ? events.length : index, 0, e as unknown as T);
            }

            store.set(events);
        };

        store.startSubscription = () => {
            if (!store.filters) {
                throw new Error('no filters');
            }

            const filters: NDKFilter[] = store.filters;

            if (opts?.repostsFilters) {
                filters.push(...opts.repostsFilters);
            }

            sub = this.subscribe(filters, opts);

            sub.on('event', (event: NDKEvent) => {
                handleEvent(event);
            });

            store.unsubscribe = () => {
                sub?.stop();
                sub = undefined;
            };

            store.onEose = (cb) => {
                sub?.on('eose', cb);
            };
        }

        if (autoStart) {
            store.startSubscription();
        }

        return store;
    }
}

export default NDKSvelte;
