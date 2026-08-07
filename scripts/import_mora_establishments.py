from __future__ import annotations

import argparse
import json
import random
import re
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import openpyxl


CATEGORY_LABELS = {
    1: "Hoteles / hosterias",
    2: "Apart / cabanas",
    3: "B&B / hospedajes",
    4: "CAT/DAT",
    5: "Hostels",
    6: "Campings",
}

SECTION_CATEGORY = {
    "hoteles y hosterias": 1,
    "apart cabanas": 2,
    "b b hospedaje residencial": 3,
    "cat dat casas y departamentos de alquiler turistico": 4,
    "albergues hostels hostales": 5,
    "campings": 6,
}


def normalize_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def clean_string(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def parse_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else round(value)
    digits = re.sub(r"[^\d-]+", "", str(value))
    if not digits or digits == "-":
        return None
    try:
        return abs(int(digits))
    except ValueError:
        return None


def parse_category_numbers(value: Any, fallback: int) -> list[int]:
    numbers = [int(match) for match in re.findall(r"[1-6]", clean_string(value))]
    if not numbers:
        numbers = [fallback]
    return sorted(dict.fromkeys(numbers))


def normalize_phone_number(value: Any) -> tuple[str, list[str]]:
    raw = clean_string(value)
    if not raw:
        return "", []

    chunks = re.split(r"[/\n,;-]+", raw)
    normalized: list[str] = []
    for chunk in chunks:
        digits = re.sub(r"\D+", "", chunk)
        if not digits:
            continue
        if digits.startswith("00"):
            digits = digits[2:]
        if digits.startswith("0"):
            digits = digits[1:]
        if len(digits) == 7 and digits.startswith("4"):
            digits = f"2944{digits}"
        if not digits.startswith("54"):
            digits = f"54{digits}"
        normalized.append(f"+{digits}")

    normalized = list(dict.fromkeys(normalized))
    return (normalized[0] if normalized else ""), normalized


def date_only(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return None


def date_document(value: str | None) -> dict[str, str] | None:
    if not value:
        return None
    return {"$date": f"{value}T00:00:00.000Z"}


def row_key(name: Any, habilitation: Any, social_reason: Any) -> tuple[str, str, str]:
    return (
        clean_string(parse_int(habilitation)),
        normalize_text(name),
        normalize_text(social_reason),
    )


def compact_key(name: Any, habilitation: Any, social_reason: Any) -> str:
    habilitation_text, name_text, social_text = row_key(name, habilitation, social_reason)
    return "|".join([habilitation_text, name_text, social_text])


def category_from_section(value: Any, default: int) -> int:
    normalized = normalize_text(value)
    return SECTION_CATEGORY.get(normalized, default)


def build_record(row: tuple[Any, ...], category: int, source_sheet: str, source_row: int) -> dict[str, Any] | None:
    name = clean_string(row[2] if len(row) > 2 else "")
    if not name:
        return None

    code = row[1] if len(row) > 1 else category
    phone, all_phones = normalize_phone_number(row[8] if len(row) > 8 else "")
    units = parse_int(row[10] if len(row) > 10 else None)
    places = parse_int(row[11] if len(row) > 11 else None)
    category_numbers = parse_category_numbers(code, category)
    accommodation_types = [CATEGORY_LABELS[number] for number in category_numbers]

    return {
        "source_sheet": source_sheet,
        "source_row": source_row,
        "category": clean_string(row[0] if len(row) > 0 else ""),
        "category_number": category,
        "category_numbers": category_numbers,
        "accommodation_type": CATEGORY_LABELS[category],
        "accommodation_types": accommodation_types,
        "accommodation_name": name,
        "establishment_name": name,
        "social_reason": clean_string(row[3] if len(row) > 3 else ""),
        "address": clean_string(row[4] if len(row) > 4 else ""),
        "habilitation_number": clean_string(row[5] if len(row) > 5 else ""),
        "parcel_number": clean_string(row[5] if len(row) > 5 else ""),
        "nomenclature": clean_string(row[6] if len(row) > 6 else ""),
        "neighborhood": clean_string(row[7] if len(row) > 7 else ""),
        "raw_phone": clean_string(row[8] if len(row) > 8 else ""),
        "phone": phone,
        "whatsapp": phone,
        "phones": all_phones,
        "email": clean_string(row[9] if len(row) > 9 else ""),
        "units": units,
        "places": places,
    }


def read_records(workbook: openpyxl.Workbook) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for sheet_name, default_category in [("ALOJAMIENTOS ", 1), ("CAMPINGS", 6)]:
        sheet = workbook[sheet_name]
        current_category = default_category
        for row_index in range(3, sheet.max_row + 1):
            row = tuple(sheet.cell(row_index, column).value for column in range(1, sheet.max_column + 1))
            if row[0]:
                current_category = category_from_section(row[0], default_category)
            if not clean_string(row[2] if len(row) > 2 else ""):
                continue
            category = 6 if sheet_name == "CAMPINGS" else current_category
            record = build_record(row, category, sheet_name.strip(), row_index)
            if record:
                records.append(record)
    return records


def read_temporary_leaves(workbook: openpyxl.Workbook) -> list[dict[str, Any]]:
    sheet = workbook["BAJAS TEMPORALES"]
    leaves: list[dict[str, Any]] = []
    ranges = [(3, 79, 4), (84, 94, 6)]
    for start, end, category_number in ranges:
        for row_index in range(start, end + 1):
            name = sheet.cell(row_index, 1).value
            if not clean_string(name):
                continue
            start_date = date_only(sheet.cell(row_index, 6).value)
            end_date = date_only(sheet.cell(row_index, 7).value)
            if not start_date or not end_date:
                continue
            leaves.append(
                {
                    "source_row": row_index,
                    "name": clean_string(name),
                    "social_reason": clean_string(sheet.cell(row_index, 2).value),
                    "address": clean_string(sheet.cell(row_index, 3).value),
                    "habilitation_number": clean_string(sheet.cell(row_index, 4).value),
                    "phone": clean_string(sheet.cell(row_index, 5).value),
                    "category_number": category_number,
                    "temporary_leave_start": start_date,
                    "temporary_leave_end": end_date,
                    "match_key": compact_key(name, sheet.cell(row_index, 4).value, sheet.cell(row_index, 2).value),
                }
            )
    return leaves


def apply_temporary_leaves(records: list[dict[str, Any]], leaves: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_habilitation: dict[str, list[dict[str, Any]]] = {}
    by_name: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        habilitation = clean_string(parse_int(record.get("habilitation_number")))
        if habilitation:
            by_habilitation.setdefault(habilitation, []).append(record)
        by_name.setdefault(normalize_text(record["accommodation_name"]), []).append(record)

    unmatched = []
    for leave in leaves:
        candidates: list[dict[str, Any]] = []
        habilitation = clean_string(parse_int(leave["habilitation_number"]))
        if habilitation:
            candidates = by_habilitation.get(habilitation, [])
        if not candidates:
            candidates = by_name.get(normalize_text(leave["name"]), [])
        if leave["category_number"] == 6:
            candidates = [record for record in candidates if record["category_number"] == 6] or candidates
        else:
            candidates = [record for record in candidates if record["category_number"] != 6] or candidates
        if not candidates:
            unmatched.append(leave)
            continue
        for record in candidates:
            record["temporary_leave_start"] = leave["temporary_leave_start"]
            record["temporary_leave_end"] = leave["temporary_leave_end"]
            record["temporary_leave_source_row"] = leave["source_row"]
    return unmatched


def record_from_unmatched_leave(leave: dict[str, Any]) -> dict[str, Any]:
    phone, all_phones = normalize_phone_number(leave["phone"])
    category_number = leave["category_number"]
    return {
        "source_sheet": "BAJAS TEMPORALES",
        "source_row": leave["source_row"],
        "category": "BAJA TEMPORAL",
        "category_number": category_number,
        "category_numbers": [category_number],
        "accommodation_type": CATEGORY_LABELS[category_number],
        "accommodation_types": [CATEGORY_LABELS[category_number]],
        "accommodation_name": leave["name"],
        "establishment_name": leave["name"],
        "social_reason": leave["social_reason"],
        "address": leave["address"],
        "habilitation_number": leave["habilitation_number"],
        "parcel_number": leave["habilitation_number"],
        "nomenclature": "",
        "neighborhood": "",
        "raw_phone": leave["phone"],
        "phone": phone,
        "whatsapp": phone,
        "phones": all_phones,
        "email": "",
        "units": None,
        "places": None,
        "temporary_leave_start": leave["temporary_leave_start"],
        "temporary_leave_end": leave["temporary_leave_end"],
        "temporary_leave_source_row": leave["source_row"],
        "created_from_temporary_leave": True,
    }


def assign_ids(records: list[dict[str, Any]], seed: int) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    used: set[str] = set()
    for record in records:
        while True:
            candidate = str(rng.randint(10_000_000, 99_999_999))
            if candidate not in used:
                used.add(candidate)
                break
        record["id"] = candidate
    return records


def build_user_documents(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc).isoformat()
    users = [
        {
            "_id": "meb-admin",
            "role": "admin",
            "display_name": "Admin MEB",
            "username": "admin",
            "password": "admin123",
            "seed_source": "mora_ultima_etapa_2026",
            "updated_at": now,
        }
    ]
    for record in records:
        document = {
            "_id": record["id"],
            "role": "establishment",
            "display_name": record["accommodation_name"],
            "establishment_name": record["establishment_name"],
            "accommodation_name": record["accommodation_name"],
            "social_reason": record["social_reason"],
            "parcel_number": record["parcel_number"],
            "address": record["address"],
            "phone": record["phone"],
            "whatsapp": record["whatsapp"],
            "raw_phone": record["raw_phone"],
            "phones": record["phones"],
            "email": record["email"],
            "units": record["units"],
            "places": record["places"],
            "accommodation_type": record["accommodation_type"],
            "accommodation_types": record["accommodation_types"],
            "category": record["category"],
            "category_number": record["category_number"],
            "category_numbers": record["category_numbers"],
            "habilitation_number": record["habilitation_number"],
            "nomenclature": record["nomenclature"],
            "neighborhood": record["neighborhood"],
            "temporary_leave_start": date_document(record.get("temporary_leave_start")),
            "temporary_leave_end": date_document(record.get("temporary_leave_end")),
            "temporary_leave_source_row": record.get("temporary_leave_source_row"),
            "source_sheet": record["source_sheet"],
            "source_row": record["source_row"],
            "seed_source": "mora_ultima_etapa_2026",
            "updated_at": now,
        }
        users.append({key: value for key, value in document.items() if value not in ("", [], None)})
    return users


def write_outputs(records: list[dict[str, Any]], users: list[dict[str, Any]], unmatched: list[dict[str, Any]]) -> None:
    seed_records = []
    for record in records:
        seed_record = {key: value for key, value in record.items() if key != "id"}
        seed_record["id"] = record["id"]
        seed_records.append(seed_record)
    Path("backend/app/establishments_seed.json").write_text(
        json.dumps(seed_records, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    Path("exports").mkdir(exist_ok=True)
    Path("exports/turismo-mora-ultima-etapa-db.json").write_text(
        json.dumps(
            {
                "source": "LISTADO COMPLETO TURISMO MORA - ULTIMA ETAPA.xlsx",
                "collections": {
                    "users": users,
                    "occupancy_entries": [],
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    Path("exports/turismo-mora-import-report.json").write_text(
        json.dumps(
            {
                "establishments": len(records),
                "temporary_leaves_applied": sum(1 for record in records if record.get("temporary_leave_start")),
                "temporary_leaves_unmatched": unmatched,
                "by_category": {
                    CATEGORY_LABELS[number]: sum(1 for record in records if record["category_number"] == number)
                    for number in sorted(CATEGORY_LABELS)
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", nargs="?", default=r"C:\Users\PC 1\Downloads\LISTADO COMPLETO TURISMO MORA - ÚLTIMA ETAPA.xlsx")
    parser.add_argument("--seed", type=int, default=20260807)
    args = parser.parse_args()

    workbook_path = Path(args.workbook)
    if not workbook_path.exists():
        matches = list(Path(r"C:\Users\PC 1\Downloads").glob("LISTADO COMPLETO TURISMO MORA*.xlsx"))
        if not matches:
            raise FileNotFoundError(workbook_path)
        workbook_path = matches[0]

    workbook = openpyxl.load_workbook(workbook_path, data_only=True)
    records = read_records(workbook)
    leaves = read_temporary_leaves(workbook)
    unmatched = apply_temporary_leaves(records, leaves)
    records.extend(record_from_unmatched_leave(leave) for leave in unmatched)
    records = assign_ids(records, args.seed)
    users = build_user_documents(records)
    write_outputs(records, users, [])

    print(f"Establecimientos generados: {len(records)}")
    print(f"Usuarios Mongo a insertar: {len(users)}")
    print(f"Bajas temporales leidas con fecha: {len(leaves)}")
    print(f"Bajas temporales aplicadas: {sum(1 for record in records if record.get('temporary_leave_start'))}")
    print(f"Bajas temporales agregadas desde hoja de bajas: {len(unmatched)}")
    for number in sorted(CATEGORY_LABELS):
        print(f"- {CATEGORY_LABELS[number]}: {sum(1 for record in records if record['category_number'] == number)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
