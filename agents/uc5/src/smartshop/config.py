import os

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "project-fd286af4-b340-4967-86b").strip()
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1").strip()
AGENT_MODEL = os.environ.get("AGENT_MODEL", "gemini-2.5-flash").strip()
BUCKET = os.environ.get("MARKETING_GCS_BUCKET", "smartshop-marketing").strip()
MAPS_API_KEY = os.environ.get("MAPS_API_KEY", "").strip()
DRIVE_FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID", "").strip()
IMAGE_MODEL = os.environ.get("IMAGEN_MODEL", "gemini-3.1-flash-image").strip()
VEO_MODEL = os.environ.get("VEO_MODEL", "veo-3.1-generate-001").strip()
VEO_LOCATION = os.environ.get("VEO_LOCATION", "us-central1").strip()

READ_TABLES = (
    f"`{PROJECT}.routes.stores`",
    f"`{PROJECT}.routes.store_plan_results`",
    f"`{PROJECT}.routes.express_order_routes`",
    f"`{PROJECT}.marketing.catalogue_products`",
    f"`{PROJECT}.marketing.assets`",
)
