package com.ourstory.google;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/** Wire models of the Google Photos Picker API (only the fields we use). */
public final class PickerModels {

    private PickerModels() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PollingConfig(String pollInterval, String timeoutIn) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PickerSession(String id, String pickerUri, PollingConfig pollingConfig, String expireTime,
            boolean mediaItemsSet) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record MediaFileMetadata(Integer width, Integer height) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record MediaFile(String baseUrl, String mimeType, String filename, MediaFileMetadata mediaFileMetadata) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PickedMediaItem(String id, String createTime, String type, MediaFile mediaFile) {

        public boolean isVideo() {
            return "VIDEO".equalsIgnoreCase(type)
                    || (mediaFile != null && mediaFile.mimeType() != null
                            && mediaFile.mimeType().toLowerCase().startsWith("video/"));
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record MediaItemsPage(List<PickedMediaItem> mediaItems, String nextPageToken) {
    }
}
