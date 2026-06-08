package org.microarchitecturovisco.aiarrangeservice.domain.model.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerSnapshotDiffResponse {

    private UUID conversationId;
    private Integer fromVersion;
    private Integer toVersion;
    private String fromTitle;
    private String toTitle;

    @Builder.Default
    private List<PlannerSnapshotDiffItem> changes = new ArrayList<>();
}
