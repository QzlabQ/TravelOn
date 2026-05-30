from __future__ import annotations

from app.models import AgentStatus, AgentWarning
from app.services.planner_agent import _status_from_warnings


def test_mock_data_warnings_do_not_downgrade_agent_status() -> None:
    warnings = [
        AgentWarning(code="MOCK_DATA_USED", message="mock hotels", source="search_hotels"),
        AgentWarning(code="MOCK_DATA_USED", message="mock weather", source="get_weather"),
        AgentWarning(code="MOCK_DATA_USED", message="mock transport", source="search_flights"),
    ]

    assert _status_from_warnings(warnings) == AgentStatus.SUCCESS


def test_degrading_warning_downgrades_agent_status() -> None:
    warnings = [
        AgentWarning(
            code="MODEL_OUTPUT_INVALID",
            message="model output failed schema validation",
            source="deepseek",
        )
    ]

    assert _status_from_warnings(warnings) == AgentStatus.PARTIAL_SUCCESS
