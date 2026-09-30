package com.ourstory;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ourstory.common.UlidGenerator;
import com.ourstory.media.MediaRecord;
import com.ourstory.media.MediaRepository;
import com.ourstory.media.MediaSize;
import com.ourstory.media.MediaStorage;
import java.awt.Color;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

/** Serving an image must not load the whole media row (with its lqip data URI). */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:ourstory-narrow-query-test;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MediaControllerNarrowQueryTest {

    @Autowired MockMvc mvc;
    @Autowired UlidGenerator ulids;
    @Autowired MediaStorage storage;
    @MockitoSpyBean MediaRepository media;

    @Test
    void servingAnImageUsesTheNarrowImportedAtQueryOnly() throws Exception {
        String id = ulids.next();
        media.insert(new MediaRecord(id, "g-" + id, "image/jpeg", 1, 1, null, "a.jpg", "data:image/jpeg;base64,AA==",
                "#000000", OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS)));
        storage.write(id, MediaSize.THUMB, TestSupport.jpeg(Color.RED, 8, 8));
        try {
            mvc.perform(get("/api/media/" + id + "/thumb")
                            .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                    .andExpect(status().isOk());
            verify(media).findImportedAt(id);
            verify(media, never()).findById(anyString());
        } finally {
            media.deleteById(id);
            storage.deleteAll(id);
        }
    }
}
