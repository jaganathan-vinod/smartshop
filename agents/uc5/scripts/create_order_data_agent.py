"""Create or update the BigQuery data agent for SmartShop order statistics.

Install the client in Cloud Shell, then run this as the project owner:

    pip install google-cloud-geminidataanalytics
    python3 scripts/create_order_data_agent.py
"""

from google.api_core import client_options
from google.api_core.exceptions import AlreadyExists
from google.cloud import geminidataanalytics
from google.protobuf import field_mask_pb2

PROJECT = "project-fd286af4-b340-4967-86b"
LOCATION = "global"
AGENT_ID = "smartshop-orders"
RESOURCE = f"projects/{PROJECT}/locations/{LOCATION}/dataAgents/{AGENT_ID}"

INSTRUCTION = (
    "Answer questions about SmartShop orders from orders.orders and orders.order_lines. "
    "orders.orders has one row per order. orders.order_lines has one row per product on an order. "
    "Join them on order_id. Every money column is integer cents; divide by 100 when stating dollars. "
    "status is the order status. delivery_method is EXPRESS or STANDARD. "
    "is_premium_at_purchase marks a premium purchase. "
    "Do not invent orders. If a table is empty, say the snapshot has no orders. "
    "The tables are a manual copy of DynamoDB and show the last load, not live checkout."
)


def main() -> None:
    endpoint = "geminidataanalytics.googleapis.com"
    client = geminidataanalytics.DataAgentServiceClient(
        client_options=client_options.ClientOptions(api_endpoint=endpoint)
    )
    published = geminidataanalytics.Context()
    published.system_instruction = INSTRUCTION
    published.datasource_references = _sources()
    published.options.analysis.python.enabled = False
    published.options.datasource.big_query_max_billed_bytes = 104857600

    data_agent = geminidataanalytics.DataAgent()
    data_agent.name = RESOURCE
    data_agent.description = "Order status, counts, revenue, and units sold from the SmartShop orders snapshot."
    data_agent.data_analytics_agent.published_context = published
    try:
        client.create_data_agent_sync(
            request=geminidataanalytics.CreateDataAgentRequest(
                parent=f"projects/{PROJECT}/locations/{LOCATION}",
                data_agent_id=AGENT_ID,
                data_agent=data_agent,
            )
        )
        print(f"created {RESOURCE}")
    except AlreadyExists:
        client.update_data_agent_sync(
            request=geminidataanalytics.UpdateDataAgentRequest(
                data_agent=data_agent,
                update_mask=field_mask_pb2.FieldMask(
                    paths=["description", "data_analytics_agent.published_context"]
                ),
            )
        )
        print(f"updated {RESOURCE}")


def _sources():
    orders = geminidataanalytics.BigQueryTableReference()
    orders.project_id = PROJECT
    orders.dataset_id = "orders"
    orders.table_id = "orders"
    orders.schema = geminidataanalytics.Schema()
    orders.schema.description = "One SmartShop order. Money fields are integer cents."
    lines = geminidataanalytics.BigQueryTableReference()
    lines.project_id = PROJECT
    lines.dataset_id = "orders"
    lines.table_id = "order_lines"
    lines.schema = geminidataanalytics.Schema()
    lines.schema.description = "One product line on a SmartShop order. Join to orders on order_id."
    sources = geminidataanalytics.DatasourceReferences()
    sources.bq.table_references = [orders, lines]
    return sources


if __name__ == "__main__":
    main()
