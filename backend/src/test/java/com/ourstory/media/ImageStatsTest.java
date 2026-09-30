package com.ourstory.media;

import static org.assertj.core.api.Assertions.assertThat;

import com.ourstory.TestSupport;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.Random;
import java.util.zip.CRC32;
import org.junit.jupiter.api.Test;

class ImageStatsTest {

    /** A PNG that is only signature + IHDR (13 bytes of header) yet declares the given dimensions. */
    private static byte[] pngDeclaring(int width, int height) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        DataOutputStream data = new DataOutputStream(out);
        data.write(new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A});
        ByteArrayOutputStream ihdr = new ByteArrayOutputStream();
        DataOutputStream body = new DataOutputStream(ihdr);
        body.writeBytes("IHDR");
        body.writeInt(width);
        body.writeInt(height);
        body.write(new byte[] {8, 2, 0, 0, 0}); // 8-bit RGB, no interlace
        CRC32 crc = new CRC32();
        crc.update(ihdr.toByteArray());
        data.writeInt(13);
        data.write(ihdr.toByteArray());
        data.writeInt((int) crc.getValue());
        return out.toByteArray();
    }

    @Test
    void averagesASmallImage() {
        assertThat(ImageStats.dominantColor(TestSupport.jpeg(new Color(200, 30, 30), 32, 32)))
                .matches("^#[c-d][0-9a-f]{1}[0-9a-f]{4}$");
    }

    @Test
    void skipsImagesThatDeclareHugeDimensionsWithoutDecodingThem() throws IOException {
        // 100000 x 100000 RGB would need ~30 GB if decoded; the header check must stop it first.
        assertThat(ImageStats.dominantColor(pngDeclaring(100_000, 100_000))).isNull();
        assertThat(ImageStats.dominantColor(pngDeclaring(513, 10))).isNull();
        assertThat(ImageStats.dominantColor(pngDeclaring(10, 513))).isNull();
        assertThat(ImageStats.dominantColor(pngDeclaring(0, 10))).isNull();
    }

    @Test
    void skipsRealImagesLargerThanTheDimensionCap() {
        assertThat(ImageStats.dominantColor(TestSupport.jpeg(Color.RED, 600, 600))).isNull();
        assertThat(ImageStats.dominantColor(TestSupport.jpeg(Color.RED, 512, 512))).isNotNull();
    }

    @Test
    void skipsInputsLargerThanTheByteCap() {
        byte[] noise = new byte[ImageStats.MAX_BYTES + 1];
        new Random(1).nextBytes(noise);
        assertThat(ImageStats.dominantColor(noise)).isNull();
    }

    @Test
    void undecodableOrEmptyInputYieldsNull() {
        assertThat(ImageStats.dominantColor(null)).isNull();
        assertThat(ImageStats.dominantColor(new byte[0])).isNull();
        assertThat(ImageStats.dominantColor("not an image".getBytes())).isNull();
        byte[] truncated = TestSupport.jpeg(Color.RED, 32, 32);
        assertThat(ImageStats.dominantColor(java.util.Arrays.copyOf(truncated, 40))).isNull();
    }
}
