package com.ourstory.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URI;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Caps request bodies by the bytes ACTUALLY read (so chunked uploads without Content-Length are limited too):
 * 4 KiB on the unauthenticated /api/auth/** and 1 MiB on /api/admin/**. A declared Content-Length over the
 * limit is refused before anything is read; otherwise the stream fails once the limit is exceeded. Both cases
 * answer 413 with a ProblemDetail body.
 */
public final class BodyLimitFilter extends OncePerRequestFilter {

    public static final long AUTH_LIMIT_BYTES = 4096;
    public static final long ADMIN_LIMIT_BYTES = 1024 * 1024;
    private static final Set<String> BODY_METHODS = Set.of("POST", "PUT", "PATCH");

    private final ObjectMapper mapper;

    public BodyLimitFilter(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    static long limitFor(HttpServletRequest request) {
        if (!BODY_METHODS.contains(request.getMethod())) {
            return -1;
        }
        String path = request.getRequestURI();
        if (path.startsWith("/api/auth/")) {
            return AUTH_LIMIT_BYTES;
        }
        return path.startsWith("/api/admin/") ? ADMIN_LIMIT_BYTES : -1;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return limitFor(request) < 0;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        long limit = limitFor(request);
        if (request.getContentLengthLong() > limit) {
            reject(response, limit);
            return;
        }
        try {
            chain.doFilter(new CountingRequest(request, limit), response);
        } catch (ServletException | IOException e) {
            if (RequestBodyTooLargeException.isCausedBy(e) && !response.isCommitted()) {
                reject(response, limit);
                return;
            }
            throw e;
        }
    }

    private void reject(HttpServletResponse response, long limit) throws IOException {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.PAYLOAD_TOO_LARGE,
                "The request body is larger than " + limit + " bytes");
        pd.setTitle(HttpStatus.PAYLOAD_TOO_LARGE.getReasonPhrase());
        pd.setType(URI.create("urn:ourstory:problem:payload-too-large"));
        response.setStatus(HttpStatus.PAYLOAD_TOO_LARGE.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getOutputStream().write(mapper.writeValueAsBytes(pd));
    }

    /** Request whose body stream throws once {@code limit} bytes were exceeded. */
    private static final class CountingRequest extends HttpServletRequestWrapper {

        private final long limit;
        private ServletInputStream stream;

        CountingRequest(HttpServletRequest request, long limit) {
            super(request);
            this.limit = limit;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            if (stream == null) {
                stream = new CountingStream(super.getInputStream(), limit);
            }
            return stream;
        }

        @Override
        public BufferedReader getReader() throws IOException {
            String encoding = getCharacterEncoding();
            Charset charset = encoding == null ? StandardCharsets.UTF_8 : Charset.forName(encoding);
            return new BufferedReader(new InputStreamReader(getInputStream(), charset));
        }
    }

    private static final class CountingStream extends ServletInputStream {

        private final ServletInputStream delegate;
        private final long limit;
        private long count;

        CountingStream(ServletInputStream delegate, long limit) {
            this.delegate = delegate;
            this.limit = limit;
        }

        @Override
        public int read() throws IOException {
            int b = delegate.read();
            if (b >= 0) {
                add(1);
            }
            return b;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int n = delegate.read(buffer, offset, length);
            if (n > 0) {
                add(n);
            }
            return n;
        }

        private void add(int n) throws IOException {
            count += n;
            if (count > limit) {
                throw new RequestBodyTooLargeException(limit);
            }
        }

        @Override
        public boolean isFinished() {
            return delegate.isFinished();
        }

        @Override
        public boolean isReady() {
            return delegate.isReady();
        }

        @Override
        public void setReadListener(ReadListener listener) {
            delegate.setReadListener(listener);
        }
    }
}
