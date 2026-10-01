package com.ourstory.content;

import java.time.LocalDate;

/** A photo placed in a world. {@code note} is the "back of the polaroid". */
public record Moment(String id, String worldId, String mediaId, String caption, String note,
        LocalDate happenedOn, String place, int sortOrder, boolean favourite) {
}
