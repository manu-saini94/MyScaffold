package com.ourstory.config;

import java.util.Set;

/**
 * Which GET paths are client-side (React Router) routes and therefore answered with index.html.
 * A client route is any path that does not start with a server-owned prefix and whose last segment has no dot
 * (no file extension). Used by both the resource resolver and the security rules so they cannot disagree.
 */
public final class SpaRoutes {

    /** First path segments owned by the server; never rewritten to index.html. */
    private static final Set<String> SERVER_PREFIXES =
            Set.of("api", "oauth2", "login", "logout", "actuator", "assets", "error");

    private SpaRoutes() {
    }

    /** @param path the path inside the application, with or without the leading slash, no query string. */
    public static boolean isClientRoute(String path) {
        if (path == null) {
            return false;
        }
        String p = path.startsWith("/") ? path.substring(1) : path;
        if (p.isEmpty() || p.length() > 200 || p.contains("//") || p.indexOf((char) 92) >= 0 || p.indexOf('%') >= 0) {
            return false;
        }
        int slash = p.indexOf('/');
        String first = slash < 0 ? p : p.substring(0, slash);
        if (SERVER_PREFIXES.contains(first.toLowerCase(java.util.Locale.ROOT))) {
            return false;
        }
        String last = p.substring(p.lastIndexOf('/') + 1);
        return !last.contains(".") && !p.contains("..");
    }
}
