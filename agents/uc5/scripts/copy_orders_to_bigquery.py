"""Copy SmartShop orders from DynamoDB into BigQuery.

Run export on a machine that can scan the orders table. Run load in Cloud Shell
as the project owner. Idempotency rows are skipped. Each load replaces the tables.
"""

import argparse
import json
from decimal import Decimal
from pathlib import Path

import boto3
from boto3.dynamodb.conditions import Attr
from google.cloud import bigquery

PROJECT = "project-fd286af4-b340-4967-86b"
DATASET = "orders"
REGION = "ap-southeast-1"


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    export = sub.add_parser("export")
    export.add_argument("--table", required=True)
    export.add_argument("--out", type=Path, required=True)
    export.add_argument("--region", default=REGION)
    load = sub.add_parser("load")
    load.add_argument("--dir", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "export":
        export_orders(args.table, args.region, args.out)
        return
    load_orders(args.dir)


def export_orders(table_name: str, region: str, out: Path) -> None:
    table = boto3.resource("dynamodb", region_name=region).Table(table_name)
    orders: list[dict] = []
    lines: list[dict] = []
    start_key = None
    while True:
        kwargs = {"FilterExpression": Attr("sk").begins_with("ORDER#")}
        if start_key:
            kwargs["ExclusiveStartKey"] = start_key
        page = table.scan(**kwargs)
        for item in page.get("Items", []):
            order, order_lines = rows_from_item(item)
            orders.append(order)
            lines.extend(order_lines)
        start_key = page.get("LastEvaluatedKey")
        if not start_key:
            break
    out.mkdir(parents=True, exist_ok=True)
    _write(out / "orders.ndjson", orders)
    _write(out / "order_lines.ndjson", lines)
    print(f"exported {len(orders)} orders and {len(lines)} lines to {out}")


def rows_from_item(item: dict) -> tuple[dict, list[dict]]:
    breakdown = item.get("breakdown") or {}
    raw_items = item.get("items") or []
    lines = []
    unit_count = 0
    for raw in raw_items:
        quantity = _int(raw.get("quantity"))
        unit_price = _int(raw.get("unitPriceCents"))
        unit_count += quantity
        lines.append(
            {
                "order_id": item.get("orderId"),
                "order_number": item.get("orderNumber"),
                "created_at": item.get("createdAt"),
                "product_id": raw.get("productId"),
                "product_name": raw.get("name"),
                "quantity": quantity,
                "unit_price_cents": unit_price,
                "line_total_cents": quantity * unit_price,
            }
        )
    order = {
        "order_id": item.get("orderId"),
        "order_number": item.get("orderNumber"),
        "user_id": item.get("userId"),
        "status": item.get("status"),
        "delivery_method": item.get("deliveryMethod"),
        "currency": breakdown.get("currency") or "USD",
        "subtotal_cents": _int(breakdown.get("subtotalCents")),
        "premium_discount_cents": _int(breakdown.get("premiumDiscountCents")),
        "delivery_cents": _int(breakdown.get("deliveryCents")),
        "tax_cents": _int(breakdown.get("taxCents")),
        "total_cents": _int(breakdown.get("totalCents")),
        "is_premium_at_purchase": bool(item.get("isPremiumAtPurchase")),
        "created_at": item.get("createdAt"),
        "delivery_address": item.get("deliveryAddress") or "",
        "express_route_id": item.get("expressRouteId") or "",
        "item_count": len(lines),
        "unit_count": unit_count,
    }
    return order, lines


def load_orders(directory: Path) -> None:
    client = bigquery.Client(project=PROJECT)
    dataset_ref = bigquery.Dataset(f"{PROJECT}.{DATASET}")
    dataset_ref.location = "US"
    client.create_dataset(dataset_ref, exists_ok=True)
    _load(client, directory / "orders.ndjson", "orders", _order_schema())
    _load(client, directory / "order_lines.ndjson", "order_lines", _line_schema())
    print(f"loaded {PROJECT}.{DATASET}.orders and {PROJECT}.{DATASET}.order_lines")


def _load(client, path: Path, table: str, schema) -> None:
    job = client.load_table_from_file(
        path.open("rb"),
        f"{PROJECT}.{DATASET}.{table}",
        job_config=bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
            schema=schema,
        ),
    )
    job.result()


def _order_schema():
    fields = [
        ("order_id", "STRING"),
        ("order_number", "STRING"),
        ("user_id", "STRING"),
        ("status", "STRING"),
        ("delivery_method", "STRING"),
        ("currency", "STRING"),
        ("subtotal_cents", "INT64"),
        ("premium_discount_cents", "INT64"),
        ("delivery_cents", "INT64"),
        ("tax_cents", "INT64"),
        ("total_cents", "INT64"),
        ("is_premium_at_purchase", "BOOL"),
        ("created_at", "TIMESTAMP"),
        ("delivery_address", "STRING"),
        ("express_route_id", "STRING"),
        ("item_count", "INT64"),
        ("unit_count", "INT64"),
    ]
    return [bigquery.SchemaField(name, kind) for name, kind in fields]


def _line_schema():
    fields = [
        ("order_id", "STRING"),
        ("order_number", "STRING"),
        ("created_at", "TIMESTAMP"),
        ("product_id", "STRING"),
        ("product_name", "STRING"),
        ("quantity", "INT64"),
        ("unit_price_cents", "INT64"),
        ("line_total_cents", "INT64"),
    ]
    return [bigquery.SchemaField(name, kind) for name, kind in fields]


def _write(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows))


def _int(value) -> int:
    if value is None or value == "":
        return 0
    if isinstance(value, Decimal):
        return int(value)
    return int(value)


if __name__ == "__main__":
    main()
