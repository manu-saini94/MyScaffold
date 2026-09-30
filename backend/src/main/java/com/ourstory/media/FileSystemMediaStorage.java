package com.ourstory.media;

import com.ourstory.common.UlidGenerator;
import com.ourstory.config.OurStoryProperties;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;
import java.util.Comparator;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Layout: {dataDir}/media/{ulid}/{thumb|medium|full}.jpg. Ids are validated so paths cannot escape.
 * Directories are created owner-only where the file system supports POSIX permissions.
 */
@Component
public class FileSystemMediaStorage implements MediaStorage {

    private static final Logger log = LoggerFactory.getLogger(FileSystemMediaStorage.class);

    private final Path root;
    private final long minFreeBytes;

    public FileSystemMediaStorage(OurStoryProperties props) {
        this.root = Path.of(props.dataDir(), "media").toAbsolutePath().normalize();
        this.minFreeBytes = props.importJob().minFreeBytes();
    }

    @Override
    public void write(String mediaId, MediaSize size, byte[] data) throws IOException {
        Path dir = dirOf(mediaId);
        createPrivateDirectories(dir);
        if (dir.toFile().getUsableSpace() - data.length < minFreeBytes) {
            throw new DiskFullException();
        }
        Path temp = Files.createTempFile(dir, size.path() + "-", ".tmp");
        try {
            Files.write(temp, data);
            Files.move(temp, dir.resolve(fileName(size)), StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException | RuntimeException e) {
            Files.deleteIfExists(temp);
            throw e;
        }
    }

    /** Owner-only (rwx------) where POSIX permissions exist; plain directories elsewhere (Windows). */
    private static void createPrivateDirectories(Path dir) throws IOException {
        try {
            Files.createDirectories(dir,
                    PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        } catch (UnsupportedOperationException e) {
            Files.createDirectories(dir);
        }
    }

    @Override
    public Optional<StoredFile> find(String mediaId, MediaSize size) {
        if (!UlidGenerator.isValid(mediaId)) {
            return Optional.empty();
        }
        Path file = dirOf(mediaId).resolve(fileName(size));
        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }
        try {
            return Optional.of(new StoredFile(file, Files.size(file), sniffContentType(file)));
        } catch (IOException e) {
            log.warn("Cannot read media file for {}", mediaId);
            return Optional.empty();
        }
    }

    @Override
    public void deleteAll(String mediaId) {
        if (!UlidGenerator.isValid(mediaId)) {
            return;
        }
        Path dir = dirOf(mediaId);
        if (!Files.isDirectory(dir)) {
            return;
        }
        try (Stream<Path> files = Files.walk(dir)) {
            files.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException e) {
                    log.warn("Could not delete {}", p.getFileName());
                }
            });
        } catch (IOException e) {
            log.warn("Could not clean media directory for {}", mediaId);
        }
    }

    @Override
    public SweepResult sweep(Predicate<String> hasRow, Instant olderThan) {
        if (!Files.isDirectory(root)) {
            return new SweepResult(0, 0);
        }
        int temps = 0;
        int orphans = 0;
        try (DirectoryStream<Path> entries = Files.newDirectoryStream(root)) {
            for (Path entry : entries) {
                String name = entry.getFileName().toString();
                // Only real directories that look like ours are ever touched.
                if (!UlidGenerator.isValid(name) || !Files.isDirectory(entry, LinkOption.NOFOLLOW_LINKS)) {
                    continue;
                }
                boolean old = isOlderThan(entry, olderThan);
                boolean orphan = old && !hasRow.test(name);
                if (orphan) {
                    deleteAll(name);
                    orphans++;
                } else {
                    temps += deleteTemporaryFiles(entry);
                }
            }
        } catch (IOException e) {
            log.warn("Media sweep could not list the media directory");
        }
        return new SweepResult(temps, orphans);
    }

    private static boolean isOlderThan(Path path, Instant cutoff) {
        try {
            return Files.getLastModifiedTime(path, LinkOption.NOFOLLOW_LINKS).toInstant().isBefore(cutoff);
        } catch (IOException e) {
            return false;
        }
    }

    private static int deleteTemporaryFiles(Path dir) {
        int deleted = 0;
        try (DirectoryStream<Path> files = Files.newDirectoryStream(dir, "*.tmp")) {
            for (Path file : files) {
                if (Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) && Files.deleteIfExists(file)) {
                    deleted++;
                }
            }
        } catch (IOException e) {
            log.warn("Could not sweep temporary files in {}", dir.getFileName());
        }
        return deleted;
    }

    private Path dirOf(String mediaId) {
        if (!UlidGenerator.isValid(mediaId)) {
            throw new IllegalArgumentException("Invalid media id");
        }
        Path dir = root.resolve(mediaId).normalize();
        if (!dir.startsWith(root)) {
            throw new IllegalArgumentException("Invalid media id");
        }
        return dir;
    }

    private static String fileName(MediaSize size) {
        return size.path() + ".jpg";
    }

    /** Google does not document the output format, so trust the bytes, not the .jpg extension. */
    private static String sniffContentType(Path file) throws IOException {
        byte[] head = new byte[12];
        int read;
        try (InputStream in = Files.newInputStream(file)) {
            read = in.readNBytes(head, 0, head.length);
        }
        if (read >= 3 && (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8) {
            return "image/jpeg";
        }
        if (read >= 8 && (head[0] & 0xFF) == 0x89 && head[1] == 'P' && head[2] == 'N' && head[3] == 'G') {
            return "image/png";
        }
        if (read >= 12 && head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F'
                && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P') {
            return "image/webp";
        }
        if (read >= 3 && head[0] == 'G' && head[1] == 'I' && head[2] == 'F') {
            return "image/gif";
        }
        return "application/octet-stream";
    }
}
