package com.ourstory.config;

import org.springframework.boot.diagnostics.AbstractFailureAnalyzer;
import org.springframework.boot.diagnostics.FailureAnalysis;

/** Turns {@link ConfigurationProblemException} into the clean "APPLICATION FAILED TO START" report. */
public class ConfigurationProblemFailureAnalyzer extends AbstractFailureAnalyzer<ConfigurationProblemException> {

    @Override
    protected FailureAnalysis analyze(Throwable rootFailure, ConfigurationProblemException cause) {
        StringBuilder description = new StringBuilder("The Our Story configuration is invalid:\n");
        cause.problems().forEach(problem -> description.append("  - ").append(problem).append('\n'));
        return new FailureAnalysis(description.toString(),
                "Set the missing or invalid environment variables (see backend/README.md) and start again.", cause);
    }
}
