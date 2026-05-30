package org.microarchitecturovisco.aiarrangeservice.domain.model.agent;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerOption {

    private String optionId;
    private String type;
    private String label;
    private String description;
    private UUID placeId;

    @Builder.Default
    private Map<String, Object> value = new LinkedHashMap<>();

    private boolean selected;
    private boolean disabled;
    private Double confidence;
    private String impact;
}
