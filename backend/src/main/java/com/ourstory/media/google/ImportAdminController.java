package com.ourstory.media.google;

import com.ourstory.common.ApiException;
import com.ourstory.common.UlidGenerator;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
class ImportAdminController {

    private final ImportService imports;
    private final ImportJobRegistry registry;

    ImportAdminController(ImportService imports, ImportJobRegistry registry) {
        this.imports = imports;
        this.registry = registry;
    }

    record StartedJob(String jobId) {
    }

    @PostMapping("/api/admin/picker/sessions/{sessionId}/import")
    @ResponseStatus(HttpStatus.ACCEPTED)
    StartedJob start(@PathVariable String sessionId, Authentication authentication) {
        return new StartedJob(imports.start(sessionId, authentication));
    }

    @GetMapping("/api/admin/imports/{jobId}")
    ImportJobRegistry.JobView status(@PathVariable String jobId) {
        if (!UlidGenerator.isValid(jobId)) {
            throw ApiException.badRequest("Invalid job id");
        }
        return registry.find(jobId).orElseThrow(() -> ApiException.notFound("Import job"));
    }
}
