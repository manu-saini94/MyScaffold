package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class AnswerNormalizerTest {

    @ParameterizedTest
    @ValueSource(strings = {"Sample", " sAmPlE ", "sam ple", "S\tA\nMPLE", "SAMPLE", "sam ple", "ＳＡＭＰＬＥ"})
    void foldsCaseWhitespaceAndCompatibilityForms(String raw) {
        assertThat(AnswerNormalizer.normalize(raw)).contains("sample");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "\t\n", " "})
    void rejectsEmptyAndBlank(String raw) {
        assertThat(AnswerNormalizer.normalize(raw)).isEmpty();
    }

    @Test
    void rejectsNullAndOverlong() {
        assertThat(AnswerNormalizer.normalize(null)).isEmpty();
        assertThat(AnswerNormalizer.normalize("a".repeat(100))).isPresent();
        assertThat(AnswerNormalizer.normalize("a".repeat(101))).isEmpty();
        // Length is checked on the raw input too, so padding cannot smuggle a huge value through.
        assertThat(AnswerNormalizer.normalize(" ".repeat(101) + "a")).isEmpty();
    }
}
