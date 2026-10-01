package com.ourstory.auth;

import com.ourstory.config.ConfigurationProblemException;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Production-only guard: the PBKDF2 work factor may only be lowered for tests. */
@Component
@Profile("prod")
class ViewerProdChecks {

    ViewerProdChecks(ViewerProperties props) {
        if (props.pbkdf2Iterations() < ViewerProperties.MIN_PROD_ITERATIONS) {
            throw new ConfigurationProblemException(List.of("ourstory.viewer.pbkdf2-iterations must be at least "
                    + ViewerProperties.MIN_PROD_ITERATIONS + " in the prod profile"));
        }
    }
}
