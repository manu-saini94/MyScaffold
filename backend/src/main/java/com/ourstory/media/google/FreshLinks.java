package com.ourstory.media.google;

import com.ourstory.common.GoogleReconnectRequiredException;
import com.ourstory.google.PickerClient;
import com.ourstory.google.PickerModels.PickedMediaItem;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Per-job source of current baseUrls. Picker baseUrls expire (about 60 minutes), so a large import can hit
 * 403/404 late in the job. The session is re-listed AT MOST ONCE per job (guarded, never loops); after
 * that every item, including ones not started yet, uses the refreshed url.
 */
final class FreshLinks {

    private static final Logger log = LoggerFactory.getLogger(FreshLinks.class);

    private final PickerClient client;
    private final Supplier<String> token;
    private final String sessionId;
    private volatile Map<String, PickedMediaItem> byId = Map.of();
    private boolean refreshed;

    FreshLinks(PickerClient client, Supplier<String> token, String sessionId) {
        this.client = client;
        this.token = token;
        this.sessionId = sessionId;
    }

    /** The item with the newest known baseUrl (the original until a refresh happened). */
    PickedMediaItem latest(PickedMediaItem original) {
        return byId.getOrDefault(original.id(), original);
    }

    /** Re-lists the session the first time it is called; later calls do nothing. */
    synchronized void refreshOnce() {
        if (refreshed) {
            return;
        }
        refreshed = true;
        try {
            List<PickedMediaItem> items = client.listAllMediaItems(token.get(), sessionId);
            Map<String, PickedMediaItem> index = new HashMap<>();
            items.stream().filter(i -> i != null && i.id() != null).forEach(i -> index.put(i.id(), i));
            byId = Map.copyOf(index);
        } catch (GoogleReconnectRequiredException e) {
            throw e;
        } catch (RuntimeException e) {
            log.warn("Could not refresh expired download links: {}", e.getClass().getSimpleName());
        }
    }
}
