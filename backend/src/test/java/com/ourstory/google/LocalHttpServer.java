package com.ourstory.google;

import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** A real loopback HTTP server (JDK com.sun.net.httpserver) that records every request it receives. */
final class LocalHttpServer implements AutoCloseable {

    /** One received request: method, path+query and the Authorization header (null when absent). */
    record Hit(String method, String path, String authorization) {
    }

    private final HttpServer server;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final List<Hit> hits = new CopyOnWriteArrayList<>();

    private LocalHttpServer(HttpServer server) {
        this.server = server;
    }

    static LocalHttpServer start(HttpHandler handler) throws IOException {
        HttpServer raw = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        LocalHttpServer local = new LocalHttpServer(raw);
        raw.createContext("/", exchange -> {
            local.hits.add(new Hit(exchange.getRequestMethod(), exchange.getRequestURI().toString(),
                    exchange.getRequestHeaders().getFirst("Authorization")));
            try {
                handler.handle(exchange);
            } finally {
                exchange.close();
            }
        });
        raw.setExecutor(local.executor);
        raw.start();
        return local;
    }

    String base() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    List<Hit> hits() {
        return List.copyOf(hits);
    }

    @Override
    public void close() {
        server.stop(0);
        executor.shutdownNow();
    }
}
