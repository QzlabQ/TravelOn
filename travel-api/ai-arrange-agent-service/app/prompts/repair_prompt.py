from __future__ import annotations


REPAIR_PROMPT = """
If the previous model output is invalid, repair it into the required JSON object only.
Preserve useful content, remove chain-of-thought, remove raw tool traces, and fill missing fields with safe partial values.
If a user-facing field cannot be recovered, use an empty array, null, or a concise Simplified Chinese fallback sentence as appropriate.
""".strip()
