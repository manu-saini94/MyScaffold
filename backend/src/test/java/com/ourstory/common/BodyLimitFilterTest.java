package com.ourstory.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.filter.OncePerRequestFilter;

/** The byte-counting body limit, with the Content-Length hidden so every request looks chunked. */
class BodyLimitFilterTest {

    @RestController
    static class Probe {
        @PostMapping(value = {"/api/auth/probe", "/api/admin/probe", "/other"}, consumes = "text/plain")
        String echoLength(@RequestBody String body) {
            return Integer.toString(body.length());
        }

        @PostMapping("/api/auth/reader")
        String reader(HttpServletRequest request) throws IOException {
            char[] buffer = new char[512];
            int total = 0;
            for (int n = request.getReader().read(buffer); n >= 0; n = request.getReader().read(buffer)) {
                total += n;
            }
            return Integer.toString(total);
        }

        @PostMapping("/api/auth/stream")
        String stream(HttpServletRequest request) throws IOException {
            return Integer.toString(request.getInputStream().readAllBytes().length);
        }

        @GetMapping("/api/auth/probe")
        String read() {
            return "ok";
        }
    }

    /** Pretends the client used chunked transfer encoding: no Content-Length is visible downstream. */
    static final class HideLength extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            chain.doFilter(new HttpServletRequestWrapper(request) {
                @Override
                public long getContentLengthLong() {
                    return -1;
                }

                @Override
                public int getContentLength() {
                    return -1;
                }
            }, response);
        }
    }

    private final MockMvc chunked = MockMvcBuilders.standaloneSetup(new Probe())
            .setControllerAdvice(new ApiExceptionHandler())
            .addFilters(new HideLength(), new BodyLimitFilter(new ObjectMapper().findAndRegisterModules())).build();

    private final MockMvc declared = MockMvcBuilders.standaloneSetup(new Probe())
            .setControllerAdvice(new ApiExceptionHandler())
            .addFilters(new BodyLimitFilter(new ObjectMapper().findAndRegisterModules())).build();

    private static String text(int bytes) {
        return "a".repeat(bytes);
    }

    @Test
    void authBodiesAreLimitedTo4096BytesActuallyRead() throws Exception {
        chunked.perform(post("/api/auth/probe").contentType(MediaType.TEXT_PLAIN).content(text(4096)))
                .andExpect(status().isOk()).andExpect(content().string("4096"));
        chunked.perform(post("/api/auth/probe").contentType(MediaType.TEXT_PLAIN).content(text(4097)))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:payload-too-large"))
                .andExpect(jsonPath("$.title").value("Payload Too Large"))
                .andExpect(jsonPath("$.status").value(413));
    }

    @Test
    void adminBodiesAreLimitedToOneMebibyte() throws Exception {
        int mib = 1024 * 1024;
        chunked.perform(post("/api/admin/probe").contentType(MediaType.TEXT_PLAIN).content(text(mib)))
                .andExpect(status().isOk());
        chunked.perform(post("/api/admin/probe").contentType(MediaType.TEXT_PLAIN).content(text(mib + 1)))
                .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.status").value(413));
    }

    @Test
    void aDeclaredContentLengthOverTheLimitIsRefusedWithoutReading() throws Exception {
        declared.perform(post("/api/auth/probe").contentType(MediaType.TEXT_PLAIN).content(text(5000)))
                .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.type")
                        .value("urn:ourstory:problem:payload-too-large"));
    }

    @Test
    void readersAndRawStreamsAreCountedToo() throws Exception {
        chunked.perform(post("/api/auth/reader").contentType(MediaType.TEXT_PLAIN).content(text(100)))
                .andExpect(status().isOk()).andExpect(content().string("100"));
        chunked.perform(post("/api/auth/reader").contentType(MediaType.TEXT_PLAIN)
                .characterEncoding(StandardCharsets.UTF_8).content(text(9000)))
                .andExpect(status().isPayloadTooLarge());
        chunked.perform(post("/api/auth/stream").contentType(MediaType.TEXT_PLAIN).content(text(4096)))
                .andExpect(status().isOk());
        chunked.perform(post("/api/auth/stream").contentType(MediaType.TEXT_PLAIN).content(text(4100)))
                .andExpect(status().isPayloadTooLarge());
    }

    @Test
    void otherPathsAndMethodsAreNotLimited() throws Exception {
        chunked.perform(post("/other").contentType(MediaType.TEXT_PLAIN).content(text(50_000)))
                .andExpect(status().isOk());
        chunked.perform(get("/api/auth/probe")).andExpect(status().isOk());
        assertThat(BodyLimitFilter.AUTH_LIMIT_BYTES).isEqualTo(4096);
        assertThat(BodyLimitFilter.ADMIN_LIMIT_BYTES).isEqualTo(1_048_576);
    }
}
