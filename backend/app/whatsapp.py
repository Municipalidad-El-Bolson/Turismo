import re
from typing import Any

import httpx

from .config import settings


def whatsapp_configured() -> bool:
    return bool(settings.whatsapp_access_token and settings.whatsapp_phone_number_id)


def normalize_whatsapp_phone(phone: str | None) -> str:
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("00"):
        digits = digits[2:]
    digits = digits.lstrip("0")
    if not digits:
        return ""
    return digits if digits.startswith("54") else f"54{digits}"


async def send_template_message(
    phone: str,
    establishment_name: str,
    period_start: str,
    detail: str,
    template_name: str | None = None,
    language_code: str | None = None,
) -> dict[str, Any]:
    if not whatsapp_configured():
        raise RuntimeError("WhatsApp API is not configured")

    normalized_phone = normalize_whatsapp_phone(phone)
    if not normalized_phone:
        raise ValueError("Missing WhatsApp phone")

    payload = {
        "messaging_product": "whatsapp",
        "to": normalized_phone,
        "type": "template",
        "template": {
            "name": template_name or settings.whatsapp_template_name,
            "language": {"code": language_code or settings.whatsapp_template_language},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": establishment_name},
                        {"type": "text", "text": period_start},
                        {"type": "text", "text": detail or "Sin detalle adicional."},
                    ],
                }
            ],
        },
    }
    url = (
        f"https://graph.facebook.com/{settings.whatsapp_api_version}/"
        f"{settings.whatsapp_phone_number_id}/messages"
    )
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_access_token}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(url, headers=headers, json=payload)
    if response.status_code >= 400:
        raise RuntimeError(response.text)
    return response.json()
