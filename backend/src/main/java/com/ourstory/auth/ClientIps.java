package com.ourstory.auth;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.regex.Pattern;

/**
 * Client address helpers for rate limiting and logging. IPv4 addresses are used exactly; IPv6 addresses are
 * aggregated to their /64 (one subscriber usually owns a whole /64, so per-address keys would be free to
 * rotate). Only literals are ever parsed, so no DNS lookup can happen.
 */
final class ClientIps {

    private static final Pattern IPV4 = Pattern.compile("^\\d{1,3}(\\.\\d{1,3}){3}$");
    private static final int MAX_RAW = 64;

    private ClientIps() {
    }

    /** The key under which failures are counted. */
    static String limiterKey(String ip) {
        InetAddress parsed = parse(ip);
        if (parsed instanceof Inet6Address v6) {
            byte[] b = v6.getAddress();
            return String.format("%02x%02x:%02x%02x:%02x%02x:%02x%02x/64", b[0], b[1], b[2], b[3], b[4], b[5],
                    b[6], b[7]);
        }
        if (parsed instanceof Inet4Address v4) {
            return v4.getHostAddress();
        }
        return raw(ip);
    }

    /** Masked form safe for logs: IPv4 {@code a.b.*.*}, IPv6 first three groups then {@code ::*}. */
    static String mask(String ip) {
        InetAddress parsed = parse(ip);
        if (parsed instanceof Inet6Address v6) {
            byte[] b = v6.getAddress();
            return String.format("%x:%x:%x::*", group(b, 0), group(b, 1), group(b, 2));
        }
        if (parsed instanceof Inet4Address v4) {
            byte[] b = v4.getAddress();
            return (b[0] & 0xff) + "." + (b[1] & 0xff) + ".*.*";
        }
        return "unknown";
    }

    private static int group(byte[] b, int index) {
        return ((b[index * 2] & 0xff) << 8) | (b[index * 2 + 1] & 0xff);
    }

    private static String raw(String ip) {
        String value = ip == null ? "unknown" : ip;
        return value.length() > MAX_RAW ? value.substring(0, MAX_RAW) : value;
    }

    private static InetAddress parse(String ip) {
        if (ip == null || ip.isBlank()) {
            return null;
        }
        String value = ip.strip();
        int zone = value.indexOf('%');
        if (zone >= 0) {
            value = value.substring(0, zone);
        }
        boolean v6 = value.indexOf(':') >= 0;
        if (!v6 && !IPV4.matcher(value).matches()) {
            return null; // not a literal: never hand it to the resolver
        }
        try {
            return InetAddress.getByName(value);
        } catch (UnknownHostException e) {
            return null;
        }
    }
}
