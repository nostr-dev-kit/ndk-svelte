# ndk-svelte

This package provides convenience functionalities to make usage of NDK with Svelte nicer.

## Store subscriptions

NDK-svelte provides Svelte Store subscriptions so your components can have simple reactivity
when events arrive.

```typescript
import NDKSvelte from '@nostr-dev-kit/ndk-svelte';

const ndk = new NDKSvelte({
    explicitRelayUrls: ['wss://relay.f7z.io'],
});
```

```typescript
// in your components
<script lang="ts">
    const highlights = $ndk.storeSubscribe(
        { kinds: [9802 as number] }, // Highlights
        { closeOnEose: false },
        NDKHighlight // Wrap all results in NDKHighlight
    );

    const nostrHighlightsAndReposts = $ndk.storeSubscribeWithReposts(
        { kinds: [9802], "#t": ["nostr"] }, // filter for Highlights with Nostr
        { kinds: [16], "#k": ["9802"], "#t": ["nostr"] }, // filter for Reposts of Highlights with Nostr
        { closeOnEose: false },
        NDKHighlight // Wrap all results in NDKHighlight
    );
    { closeOnEose: false }, NDKNote);

    onDestroy(() => {
        // Close the nostr subscription when the component is destroyed
        highlights.unsubscribe();
    });
</script>

<p>
    {$highlights.length} highlights seen
</p>

<p>
    {$nostrHighlightsAndReposts.length} nostr highlights (including reposts)
</p>
```

# Notes

If you are interested in NDK and Svelte you might want to checkout the
[ndk-svelte-components](https://github.com/nostr-dev-kit/ndk-svelte-components) package
which provides some components to make it easier to build nostr apps with Svelte.

# Authors

* [@pablof7z](https://nostr.com/npub1l2vyh47mk2p0qlsku7hg0vn29faehy9hy34ygaclpn66ukqp3afqutajft)