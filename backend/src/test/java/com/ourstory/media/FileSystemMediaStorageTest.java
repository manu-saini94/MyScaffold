package com.ourstory.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ourstory.TestSupport;
import com.ourstory.common.UlidGenerator;
import java.awt.Color;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FileSystemMediaStorageTest {

    @TempDir
    Path dir;

    private FileSystemMediaStorage storage;
    private final String id = new UlidGenerator().next();

    @BeforeEach
    void setUp() {
        storage = new FileSystemMediaStorage(TestSupport.props(dir.toString(), "a@b.c", List.of("x"), 1024, 1));
    }

    @Test
    void writesAtomicallyAndFindsTheFile() throws IOException {
        byte[] jpeg = TestSupport.jpeg(Color.BLUE, 10, 10);
        storage.write(id, MediaSize.THUMB, jpeg);
        var found = storage.find(id, MediaSize.THUMB).orElseThrow();
        assertThat(found.length()).isEqualTo(jpeg.length);
        assertThat(found.contentType()).isEqualTo("image/jpeg");
        assertThat(found.path()).isEqualTo(dir.resolve("media").resolve(id).resolve("thumb.jpg").toAbsolutePath());
        try (Stream<Path> files = Files.list(dir.resolve("media").resolve(id))) {
            assertThat(files.map(p -> p.getFileName().toString())).containsExactly("thumb.jpg"); // no temp left
        }
    }

    @Test
    void overwritesAnExistingFile() throws IOException {
        storage.write(id, MediaSize.FULL, new byte[] {(byte) 0xFF, (byte) 0xD8, 1});
        storage.write(id, MediaSize.FULL, new byte[] {(byte) 0xFF, (byte) 0xD8, 1, 2, 3});
        assertThat(storage.find(id, MediaSize.FULL).orElseThrow().length()).isEqualTo(5);
    }

    @Test
    void sniffsContentTypeFromBytes() throws IOException {
        storage.write(id, MediaSize.THUMB, new byte[] {(byte) 0x89, 'P', 'N', 'G', 0, 0, 0, 0});
        storage.write(id, MediaSize.MEDIUM, "RIFF....WEBPVP8 ".getBytes());
        storage.write(id, MediaSize.FULL, "GIF89a".getBytes());
        assertThat(storage.find(id, MediaSize.THUMB).orElseThrow().contentType()).isEqualTo("image/png");
        assertThat(storage.find(id, MediaSize.MEDIUM).orElseThrow().contentType()).isEqualTo("image/webp");
        assertThat(storage.find(id, MediaSize.FULL).orElseThrow().contentType()).isEqualTo("image/gif");
        String other = new UlidGenerator().next();
        storage.write(other, MediaSize.THUMB, "hello world!".getBytes());
        assertThat(storage.find(other, MediaSize.THUMB).orElseThrow().contentType())
                .isEqualTo("application/octet-stream");
    }

    @Test
    void missingOrMalformedIdsAreNotFoundAndNeverTouchThePath() {
        assertThat(storage.find(id, MediaSize.THUMB)).isEmpty();
        assertThat(storage.find("../../etc", MediaSize.THUMB)).isEmpty();
        assertThat(storage.find(null, MediaSize.THUMB)).isEmpty();
        assertThatThrownBy(() -> storage.write("../evil", MediaSize.THUMB, new byte[1]))
                .isInstanceOf(IllegalArgumentException.class);
        storage.deleteAll("../..");   // must be a no-op, not a traversal
        assertThat(dir).exists();
    }

    @Test
    void deleteAllRemovesTheDirectoryAndIsIdempotent() throws IOException {
        storage.write(id, MediaSize.THUMB, new byte[] {(byte) 0xFF, (byte) 0xD8, 1});
        storage.write(id, MediaSize.FULL, new byte[] {(byte) 0xFF, (byte) 0xD8, 1});
        storage.deleteAll(id);
        assertThat(dir.resolve("media").resolve(id)).doesNotExist();
        storage.deleteAll(id);
    }

    @Test
    void imageStatsAveragesColorAndToleratesGarbage() {
        assertThat(ImageStats.dominantColor(TestSupport.jpeg(new Color(255, 0, 0), 16, 16))).matches("^#(f[0-9a-f]|e[0-9a-f])[0-3][0-9a-f][0-3][0-9a-f]$");
        assertThat(ImageStats.dominantColor(TestSupport.jpeg(Color.WHITE, 8, 8))).isEqualTo("#ffffff");
        assertThat(ImageStats.dominantColor(TestSupport.jpeg(Color.BLACK, 8, 8))).isEqualTo("#000000");
        assertThat(ImageStats.dominantColor("not an image".getBytes())).isNull();
        assertThat(MediaSize.fromPath("thumb")).contains(MediaSize.THUMB);
        assertThat(MediaSize.fromPath("lqip")).isEmpty();
        assertThat(MediaSize.fromPath("../full")).isEmpty();
    }

    // --- hardening -------------------------------------------------------------------------------------------

    @Test
    void refusesToWriteWhenFreeSpaceIsBelowTheFloor() {
        FileSystemMediaStorage full = new FileSystemMediaStorage(TestSupport.props(dir.toString(), "a@b.c",
                List.of("x"), 1024, 1, "https://p.example", false, java.time.Duration.ofHours(1),
                java.time.Duration.ofMinutes(1), Long.MAX_VALUE));
        assertThatThrownBy(() -> full.write(id, MediaSize.THUMB, new byte[10])).isInstanceOf(DiskFullException.class);
        assertThat(full.find(id, MediaSize.THUMB)).isEmpty();
        Path mediaDir = dir.resolve("media").resolve(id);
        if (Files.exists(mediaDir)) {
            try (Stream<Path> files = Files.list(mediaDir)) {
                assertThat(files).isEmpty(); // nothing, not even a temp file, was written
            } catch (IOException e) {
                throw new java.io.UncheckedIOException(e);
            }
        }
    }

    @Test
    void createsOwnerOnlyDirectoriesWherePosixIsSupported() throws IOException {
        org.junit.jupiter.api.Assumptions.assumeTrue(
                java.nio.file.FileSystems.getDefault().supportedFileAttributeViews().contains("posix"));
        storage.write(id, MediaSize.THUMB, new byte[] {(byte) 0xFF, (byte) 0xD8, 1});
        assertThat(java.nio.file.attribute.PosixFilePermissions.toString(
                Files.getPosixFilePermissions(dir.resolve("media").resolve(id)))).isEqualTo("rwx------");
        assertThat(java.nio.file.attribute.PosixFilePermissions.toString(
                Files.getPosixFilePermissions(dir.resolve("media")))).isEqualTo("rwx------");
    }

    @Test
    void writingWorksOnFileSystemsWithoutPosixPermissions() throws IOException {
        // Windows: asFileAttribute throws UnsupportedOperationException, which must be tolerated.
        storage.write(id, MediaSize.MEDIUM, new byte[] {(byte) 0xFF, (byte) 0xD8, 1});
        assertThat(storage.find(id, MediaSize.MEDIUM)).isPresent();
    }

    private Path makeDir(String mediaId, int ageHours) throws IOException {
        Path media = Files.createDirectories(dir.resolve("media").resolve(mediaId));
        Files.setLastModifiedTime(media, java.nio.file.attribute.FileTime.from(
                java.time.Instant.now().minus(java.time.Duration.ofHours(ageHours))));
        return media;
    }

    @Test
    void sweepRemovesTempFilesAndOldOrphansButOnlyThose() throws IOException {
        UlidGenerator ulids = new UlidGenerator();
        String withRow = ulids.next();
        String oldOrphan = ulids.next();
        String youngOrphan = ulids.next();
        Path keep = makeDir(withRow, 5);
        Files.write(keep.resolve("thumb.jpg"), new byte[] {1});
        Files.write(keep.resolve("thumb-123.tmp"), new byte[] {1});
        Files.setLastModifiedTime(keep, java.nio.file.attribute.FileTime.from(
                java.time.Instant.now().minus(java.time.Duration.ofHours(5))));
        Files.write(makeDir(oldOrphan, 3).resolve("full.jpg"), new byte[] {1});
        Files.setLastModifiedTime(dir.resolve("media").resolve(oldOrphan), java.nio.file.attribute.FileTime.from(
                java.time.Instant.now().minus(java.time.Duration.ofHours(3))));
        Files.write(makeDir(youngOrphan, 0).resolve("full.jpg"), new byte[] {1});
        Path foreignDir = Files.createDirectories(dir.resolve("media").resolve("not-a-ulid"));
        Files.setLastModifiedTime(foreignDir, java.nio.file.attribute.FileTime.from(
                java.time.Instant.now().minus(java.time.Duration.ofHours(9))));
        Files.write(dir.resolve("media").resolve("stray.tmp"), new byte[] {1});

        var result = storage.sweep(withRow::equals, java.time.Instant.now().minus(java.time.Duration.ofHours(1)));

        assertThat(result.temporaryFiles()).isEqualTo(1);
        assertThat(result.orphanDirectories()).isEqualTo(1);
        assertThat(keep.resolve("thumb.jpg")).exists();
        assertThat(keep.resolve("thumb-123.tmp")).doesNotExist();
        assertThat(dir.resolve("media").resolve(oldOrphan)).doesNotExist();
        assertThat(dir.resolve("media").resolve(youngOrphan)).exists();  // too young: may be an import in flight
        assertThat(foreignDir).exists();                                  // not ours: never touched
        assertThat(dir.resolve("media").resolve("stray.tmp")).exists();
    }

    @Test
    void sweepOfAMissingMediaDirectoryIsANoOp() {
        var result = storage.sweep(x -> false, java.time.Instant.now());
        assertThat(result).isEqualTo(new MediaStorage.SweepResult(0, 0));
    }
}
