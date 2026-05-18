from __future__ import annotations

from app.prompts.output_contract_prompt import OUTPUT_CONTRACT_PROMPT
from app.prompts.policy_prompt import POLICY_PROMPT
from app.prompts.role_prompt import ROLE_PROMPT
from app.prompts.tool_selection_prompt import TOOL_SELECTION_PROMPT


def build_system_prompt() -> str:
    return "\n\n".join(
        [
            ROLE_PROMPT,
            POLICY_PROMPT,
            OUTPUT_CONTRACT_PROMPT,
            TOOL_SELECTION_PROMPT,
        ]
    )

