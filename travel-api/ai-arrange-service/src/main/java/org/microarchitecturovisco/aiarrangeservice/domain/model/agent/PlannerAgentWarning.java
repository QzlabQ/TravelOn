package org.microarchitecturovisco.aiarrangeservice.domain.model.agent;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerAgentWarning {

    private String code;
    private String message;
    private String source;
}
