package com.ourstory.auth;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.LoadingCache;
import com.ourstory.settings.SettingsService;
import java.time.Clock;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** The current viewer epoch from settings, cached briefly so a bump takes effect within seconds. */
@Component
public class ViewerEpoch {

    private final LoadingCache<Boolean, Long> cache;

    @Autowired
    public ViewerEpoch(SettingsService settings, ViewerProperties props, ObjectProvider<Clock> clock) {
        this(settings, props, clock.getIfAvailable(Clock::systemUTC));
    }

    ViewerEpoch(SettingsService settings, ViewerProperties props, Clock clock) {
        this.cache = Caffeine.newBuilder()
                .maximumSize(1)
                .expireAfterWrite(props.epochCacheTtl())
                .ticker(() -> TimeUnit.MILLISECONDS.toNanos(clock.millis()))
                .build(ignored -> settings.viewerEpoch());
    }

    public long current() {
        return cache.get(Boolean.TRUE);
    }

    /** Call after changing the epoch in this JVM so the new value is seen immediately. */
    public void invalidate() {
        cache.invalidateAll();
    }
}
