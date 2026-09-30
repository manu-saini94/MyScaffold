package com.ourstory.media;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;

/**
 * Image helpers built on the JDK only (ImageIO reads JPEG/PNG/GIF; other formats yield null).
 *
 * <p>Inputs are bounded BEFORE decoding, so a tiny file that declares huge dimensions cannot exhaust the
 * heap: the header is read first and anything above {@link #MAX_DIMENSION} px or {@link #MAX_BYTES} bytes
 * is skipped without decoding.
 */
public final class ImageStats {

    /** Placeholders are 32px images; this is far above that and far below anything dangerous. */
    static final int MAX_DIMENSION = 512;
    static final int MAX_BYTES = 64 * 1024;

    private ImageStats() {
    }

    /** Average RGB of the image as "#rrggbb", or null when it is too big or cannot be decoded. */
    public static String dominantColor(byte[] image) {
        if (image == null || image.length == 0 || image.length > MAX_BYTES) {
            return null;
        }
        try (ImageInputStream in = new MemoryCacheImageInputStream(new ByteArrayInputStream(image))) {
            BufferedImage decoded = decodeIfSmall(in);
            return decoded == null ? null : average(decoded);
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    private static BufferedImage decodeIfSmall(ImageInputStream in) throws IOException {
        Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
        if (!readers.hasNext()) {
            return null;
        }
        ImageReader reader = readers.next();
        try {
            reader.setInput(in, true, true);
            int width = reader.getWidth(0);
            int height = reader.getHeight(0);
            if (width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
                return null;
            }
            return reader.read(0);
        } finally {
            reader.dispose();
        }
    }

    private static String average(BufferedImage decoded) {
        long r = 0;
        long g = 0;
        long b = 0;
        long count = (long) decoded.getWidth() * decoded.getHeight();
        for (int y = 0; y < decoded.getHeight(); y++) {
            for (int x = 0; x < decoded.getWidth(); x++) {
                int rgb = decoded.getRGB(x, y);
                r += (rgb >> 16) & 0xFF;
                g += (rgb >> 8) & 0xFF;
                b += rgb & 0xFF;
            }
        }
        return String.format("#%02x%02x%02x", r / count, g / count, b / count);
    }
}
