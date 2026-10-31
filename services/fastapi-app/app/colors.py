import re

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{3,8}$")


def sanitize_color(value: str, fallback: str) -> str:
    """Keep only hex colours, so a bad value can never reach the client."""
    value = (value or "").strip()
    return value if HEX_COLOR.match(value) else fallback
