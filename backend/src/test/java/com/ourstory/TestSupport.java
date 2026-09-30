package com.ourstory;

import com.ourstory.config.OurStoryProperties;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.util.List;
import javax.imageio.ImageIO;

/** Shared helpers for tests. */
public final class TestSupport {

    private TestSupport() {
    }

    public static OurStoryProperties props(String dataDir, String adminEmail, List<String> mediaHosts,
            long maxBytes, int attempts) {
        return props(dataDir, adminEmail, mediaHosts, maxBytes, attempts, "https://photospicker.googleapis.com",
                false, Duration.ofHours(2), Duration.ofMinutes(2), 0);
    }

    /** Full variant: picker URL, insecure-http switch (real local servers), deadlines and free-space floor. */
    public static OurStoryProperties props(String dataDir, String adminEmail, List<String> mediaHosts,
            long maxBytes, int attempts, String pickerBaseUrl, boolean allowInsecureHttp, Duration jobTimeout,
            Duration downloadTimeout, long minFreeBytes) {
        return new OurStoryProperties(dataDir,
                new OurStoryProperties.Google("client-id", "client-secret", pickerBaseUrl, mediaHosts,
                        allowInsecureHttp),
                null, adminEmail, "/dev/import.html",
                new OurStoryProperties.ImportJob(4, maxBytes, attempts, 10, jobTimeout, downloadTimeout,
                        minFreeBytes),
                new OurStoryProperties.DevTools(false));
    }

    public static byte[] jpeg(Color color, int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, width, height);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "jpg", out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }
}
