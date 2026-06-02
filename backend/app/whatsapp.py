import re

import httpx

from .config import settings


def normalize_whatsapp_recipient(phone: str | None) -> str:
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("00"):
        digits = digits[2:]
    return digits


def build_reminder_message(establishment_name: str, week_start: str) -> str:
    return (
        f"Hola, {establishment_name}. Te recordamos cargar la informacion de ocupacion "
        f"correspondiente a la semana del {week_start} en el sistema de Turismo MEB. Gracias."
    )


async def send_whatsapp_text(to_phone: str, message: str) -> dict:
    recipient = normalize_whatsapp_recipient(to_phone)
    if not recipient:
        return {
            "sent": False,
            "dry_run": False,
            "to": "",
            "message": message,
            "detail": "Missing phone number",
        }

    if settings.whatsapp_provider != "meta":
        return {
            "sent": False,
            "dry_run": True,
            "to": recipient,
            "message": message,
            "detail": "WhatsApp provider is in console mode",
        }

    if not settings.whatsapp_access_token or not settings.whatsapp_phone_number_id:
        return {
            "sent": False,
            "dry_run": True,
            "to": recipient,
            "message": message,
            "detail": "WhatsApp credentials are not configured",
        }

    url = (
        f"https://graph.facebook.com/{settings.whatsapp_graph_version}/"
        f"{settings.whatsapp_phone_number_id}/messages"
    )
    payload = {
        "messaging_product": "whatsapp",
        "to": recipient,
        "type": "text",
        "text": {"preview_url": False, "body": message},
    }
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_access_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(url, json=payload, headers=headers)

    if response.status_code >= 400:
        return {
            "sent": False,
            "dry_run": False,
            "to": recipient,
            "message": message,
            "detail": response.text,
        }

    return {
        "sent": True,
        "dry_run": False,
        "to": recipient,
        "message": message,
        "detail": response.json(),
    }
