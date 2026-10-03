import re

from google.cloud import bigquery

from smartshop.config import PROJECT, READ_TABLES

def _cell(value: object) -> object:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


_FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|MERGE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|CALL|EXECUTE)\b",
    re.IGNORECASE,
)


def query_read_only(sql: str) -> dict:
    """Run one read-only BigQuery SELECT against SmartShop route or marketing tables.

    Args:
        sql: A single SELECT statement. It must name an allowed table.
    """
    text = sql.strip().rstrip(";")
    if ";" in text or not re.match(r"^(SELECT|WITH)\b", text, re.IGNORECASE):
        return {"error": "Only a single SELECT is allowed"}
    if _FORBIDDEN.search(text):
        return {"error": "That statement is not read-only"}
    if not any(table in text for table in READ_TABLES):
        return {"error": "Query must use one of the allowed tables", "tables": list(READ_TABLES)}
    job = bigquery.Client(project=PROJECT).query(text)
    rows = []
    for row in job.result(max_results=50):
        rows.append({key: _cell(row[key]) for key in row.keys()})
    return {"rowCount": len(rows), "rows": rows}
