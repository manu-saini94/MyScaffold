package com.ourstory;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class OurStoryApplication {

    public static void main(String[] args) {
        SpringApplication.run(OurStoryApplication.class, args);
    }
}
