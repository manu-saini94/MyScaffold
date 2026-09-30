package com.ourstory;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Production posture: the temporary /dev/** pages are not served at all. */
@SpringBootTest(properties = "ourstory.dev-tools.enabled=false")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DevToolsDisabledTest {

    @Autowired MockMvc mvc;

    @Test
    void devPagesAreDeniedWhenDevToolsAreOff() throws Exception {
        for (String path : new String[] {"/dev/import.html", "/dev/import.js", "/dev/import.css"}) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        }
    }
}
