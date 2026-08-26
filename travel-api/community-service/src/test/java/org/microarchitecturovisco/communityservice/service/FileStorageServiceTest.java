package org.microarchitecturovisco.communityservice.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileStorageServiceTest {
    @TempDir Path tempDir;

    @Test
    void storesImageWithPublicPathAndContent() throws Exception {
        FileStorageService service = new FileStorageService(tempDir.toString());
        var file = new MockMultipartFile("file", "photo.png", "image/png", "image-data".getBytes());

        String publicPath = service.store(file);

        assertThat(publicPath).startsWith(FileStorageService.PUBLIC_PATH_PREFIX).endsWith(".png");
        String filename = publicPath.substring(FileStorageService.PUBLIC_PATH_PREFIX.length());
        assertThat(Files.readString(tempDir.resolve(filename))).isEqualTo("image-data");
    }

    @Test
    void rejectsEmptyAndNonImageUploads() {
        FileStorageService service = new FileStorageService(tempDir.toString());

        assertThatThrownBy(() -> service.store(new MockMultipartFile("file", "", "image/png", new byte[0])))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("400 BAD_REQUEST");
        assertThatThrownBy(() -> service.store(new MockMultipartFile("file", "doc.txt", "text/plain", "text".getBytes())))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("400 BAD_REQUEST");
    }
}
