package com.ourstory.media.google;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;

@Configuration(proxyBeanMethods = false)
class ImportConfig {

    private static final Logger log = LoggerFactory.getLogger(ImportConfig.class);

    /** Virtual threads for import work; concurrency is bounded per job by a Semaphore. */
    @Bean(destroyMethod = "shutdownNow")
    ExecutorService importExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }

    /** A job still RUNNING at startup died with the previous process. */
    @EventListener(ApplicationReadyEvent.class)
    void failInterruptedJobs(ApplicationReadyEvent event) {
        int count = event.getApplicationContext().getBean(ImportJobRegistry.class).failInterrupted();
        if (count > 0) {
            log.warn("Marked {} interrupted import job(s) as FAILED", count);
        }
    }
}
