package com.ourstory.config;

import java.io.IOException;
import java.time.Duration;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Serves the built React app from classpath:/static (copied there by the "ship" Maven profile).
 * Hashed Vite output under /assets is cached for a year; everything else (index.html included) must revalidate.
 * A GET for a client route (see {@link SpaRoutes}) that matches no file is answered with index.html and 200.
 */
@Configuration
public class StaticResourceConfig implements WebMvcConfigurer {

    private static final String STATIC = "classpath:/static/";

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/assets/**")
            .addResourceLocations(STATIC + "assets/")
            .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
        registry.addResourceHandler("/**")
            .addResourceLocations(STATIC)
            .setCacheControl(CacheControl.noCache())
            .resourceChain(false)
            .addResolver(new SpaFallbackResolver());
    }

    /** Resolves real files first; falls back to index.html for extension-less, non-server paths. */
    static final class SpaFallbackResolver extends PathResourceResolver {
        @Override
        protected Resource getResource(String resourcePath, Resource location) throws IOException {
            Resource found = super.getResource(resourcePath, location);
            if (found != null || !SpaRoutes.isClientRoute(resourcePath)) {
                return found;
            }
            Resource index = location.createRelative("index.html");
            return index.exists() && index.isReadable() ? index : null;
        }
    }
}
