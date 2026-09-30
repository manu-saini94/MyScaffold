package com.ourstory.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

class ApiExceptionHandlerTest {

    /** Stands in for Tomcat's ClientAbortException (matched by simple name, no Tomcat dependency needed). */
    static class ClientAbortException extends IOException {
        ClientAbortException(String message) {
            super(message);
        }
    }

    @RestController
    static class Probe {
        @GetMapping(value = "/abort", produces = MediaType.IMAGE_JPEG_VALUE)
        byte[] abort() throws IOException {
            throw new ClientAbortException("whatever");
        }

        @GetMapping(value = "/pipe", produces = MediaType.IMAGE_JPEG_VALUE)
        byte[] pipe() throws IOException {
            throw new IOException("Broken pipe");
        }

        @GetMapping("/disk")
        String disk() throws IOException {
            throw new IOException("disk on fire /secret/path");
        }
    }

    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new Probe())
            .setControllerAdvice(new ApiExceptionHandler()).build();

    @Test
    void clientAbortsProduceNoErrorBodyAndNoServerError() throws Exception {
        for (String path : new String[] {"/abort", "/pipe"}) {
            MockHttpServletResponse response = mvc.perform(get(path)).andExpect(status().isOk()).andReturn()
                    .getResponse();
            assertThat(response.getContentAsString()).isEmpty();
        }
    }

    @Test
    void otherIoFailuresStayGeneric500sWithoutLeakingDetails() throws Exception {
        MockHttpServletResponse response = mvc.perform(get("/disk")).andExpect(status().isInternalServerError())
                .andReturn().getResponse();
        assertThat(response.getContentAsString()).contains("Unexpected server error").doesNotContain("secret");
    }

    @Test
    void recognisesAbortsAnywhereInTheCauseChain() {
        assertThat(ApiExceptionHandler.isClientAbort(new RuntimeException("x", new IOException("Connection reset by peer"))))
                .isTrue();
        assertThat(ApiExceptionHandler.isClientAbort(new IOException("An established connection was aborted by the software in your host machine"))).isTrue();
        assertThat(ApiExceptionHandler.isClientAbort(new IOException("nope"))).isFalse();
        assertThat(ApiExceptionHandler.isClientAbort(new IOException((String) null))).isFalse();
        assertThat(ApiExceptionHandler.isClientAbort(null)).isFalse();
    }
}
