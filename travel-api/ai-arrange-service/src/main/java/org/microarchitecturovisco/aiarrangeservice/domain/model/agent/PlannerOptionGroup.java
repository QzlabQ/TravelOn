package org.microarchitecturovisco.aiarrangeservice.domain.model.agent;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerOptionGroup {

    private String groupId;
    private String title;

    @Builder.Default
    private String mode = "MULTI_SELECT";

    @Builder.Default
    private Integer minSelect = 0;

    private Integer maxSelect;

    @Builder.Default
    private List<PlannerOption> options = new ArrayList<>();
}
