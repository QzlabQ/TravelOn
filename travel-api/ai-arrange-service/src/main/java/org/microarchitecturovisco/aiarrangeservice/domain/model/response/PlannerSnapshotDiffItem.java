package org.microarchitecturovisco.aiarrangeservice.domain.model.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerSnapshotDiffItem {

    private String field;
    private String label;
    private String type;
    private Object beforeValue;
    private Object afterValue;
    private String summary;
}
