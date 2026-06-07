package org.microarchitecturovisco.aiarrangeservice.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.util.UUID;

@ResponseStatus(HttpStatus.CONFLICT)
public class PlannerSnapshotVersionConflictException extends RuntimeException {

    public PlannerSnapshotVersionConflictException(
            UUID conversationId,
            Integer draftBaseVersion,
            Integer latestVersion,
            String checksum
    ) {
        super("规划版本已过期：conversationId=" + conversationId
                + "，Agent 基于版本 " + draftBaseVersion
                + " 生成，但当前最新版本是 " + latestVersion
                + (checksum == null || checksum.isBlank() ? "" : "，checksum=" + checksum));
    }
}
