package com.ourstory.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validation;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Every validation failure is a 400 ProblemDetail with errors:[{field,message}] and never echoes the value. */
class ValidationShapeTest {

    record Body(@NotBlank String name, @Size(max = 3) String code) {
    }

    @RestController
    static class Probe {
        @PostMapping("/body")
        String body(@jakarta.validation.Valid @RequestBody Body body) {
            return "ok";
        }

        @GetMapping("/num")
        String num(@RequestParam @Min(1) int n) {
            return "ok";
        }

        @GetMapping("/violation")
        String violation() {
            var validator = Validation.buildDefaultValidatorFactory().getValidator();
            Set<jakarta.validation.ConstraintViolation<Body>> violations =
                    validator.validate(new Body("", "toolongsecretvalue"));
            throw new ConstraintViolationException(violations);
        }

        @GetMapping("/big")
        String big() throws IOException {
            throw new RequestBodyTooLargeException(10);
        }
    }

    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new Probe())
            .setControllerAdvice(new ApiExceptionHandler()).build();

    @Test
    void methodArgumentNotValidIsAnArrayOfFieldAndMessage() throws Exception {
        mvc.perform(post("/body").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\" \",\"code\":\"toolongsecretvalue\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:validation-failed"))
                .andExpect(jsonPath("$.errors.length()").value(2))
                .andExpect(jsonPath("$.errors[?(@.field=='name')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='code')]").exists())
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("toolongsecretvalue"))));
    }

    @Test
    void unreadableBodiesNeverEchoTheInput() throws Exception {
        mvc.perform(post("/body").contentType(MediaType.APPLICATION_JSON).content("{broken secret"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("body"))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("secret"))));
        mvc.perform(post("/body").contentType(MediaType.APPLICATION_JSON).content("{\"name\":[1,2]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("name"));
        mvc.perform(post("/body").contentType(MediaType.APPLICATION_JSON)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("body"));
    }

    @Test
    void parameterAndConstraintViolationsUseTheSameShape() throws Exception {
        mvc.perform(get("/num").param("n", "0")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("n"));
        mvc.perform(get("/violation")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors").isArray())
                .andExpect(jsonPath("$.errors[?(@.field=='name')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='code')]").exists())
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("toolongsecretvalue"))));
    }

    @Test
    void anOversizedBodyReadingFailureIsA413ProblemNotA500() throws Exception {
        mvc.perform(get("/big")).andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:payload-too-large"));
    }
}
