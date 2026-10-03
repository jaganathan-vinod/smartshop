# SmartShop operations agents

Each specialist is its own Agent Engine. The coordinator calls them over A2A. It does not call their tools itself.

| Agent | Engine | Role |
| --- | --- | --- |
| Coordinator | `5576634465393836032` | Delegates one question |
| Delivery | `986903495149879296` | Maps geocoding, nearby grocers, driving time |
| Insights | `4376425164699598848` | Read-only BigQuery |
| Inventory | `6301714005400485888` | Stock proposals that wait for approval |
| Standards | `4434971959855415296` | Drive folder and Cloud Storage manuals |
| Marketing | `528099283111510016` | Campaign stills and six-second videos for review |

Coordinator playground: https://console.cloud.google.com/vertex-ai/agents/agent-engines/locations/us-central1/agent-engines/5576634465393836032/playground?project=project-fd286af4-b340-4967-86b

Source for the specialists is under `src/`. `deploy_specialists.py` publishes them. The coordinator source is `coordinator/`. Update it with:

```bash
adk deploy agent_engine \
  --project=project-fd286af4-b340-4967-86b \
  --region=us-central1 \
  --display_name="SmartShop coordinator" \
  --agent_engine_id=5576634465393836032 \
  .
```

Run that from `coordinator/` after `google-adk[gcp]` is installed. `coordinator/.env` holds the specialist engine ids. `agents/uc5/.env` holds `MAPS_API_KEY` and `DRIVE_FOLDER_ID` for the specialist deploy. Do not commit either file.
