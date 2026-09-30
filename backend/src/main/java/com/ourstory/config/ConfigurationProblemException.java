package com.ourstory.config;

import java.util.List;

/** Startup configuration is unusable; the message lists every problem in one go. */
public class ConfigurationProblemException extends RuntimeException {

    private final List<String> problems;

    public ConfigurationProblemException(List<String> problems) {
        super("Invalid configuration: " + String.join("; ", problems));
        this.problems = List.copyOf(problems);
    }

    public List<String> problems() {
        return problems;
    }
}
