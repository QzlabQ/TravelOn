package org.microarchitecturovisco.aiarrangeservice.domain.model.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreatePlannerMarkdownSnapshotRequest {

    public enum Mode {
        DAY,
        TRIP
    }

    @NotNull
    private UUID userId;

    @NotBlank
    private String markdown;

    @NotNull
    private Mode mode;

    private Integer dayIndex;

    @NotNull
    private Integer baseVersion;
}
