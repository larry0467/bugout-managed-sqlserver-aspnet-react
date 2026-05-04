#!/bin/bash
# =============================================================================
# Bug Out Managed - Azure Setup Script
# Run this once to create all Azure resources
# Prerequisites: az cli installed and logged in (az login)
# =============================================================================

set -e

# --- Configuration (edit these) ---
RESOURCE_GROUP="bugout-managed-rg"
LOCATION="eastus"
SQL_SERVER_NAME="bugout-managed-sql"
SQL_DB_NAME="bugout_managed"
SQL_ADMIN_USER="bugoutadmin"
SQL_ADMIN_PASSWORD="BugOutManaged2026!"  # Change this!
APP_SERVICE_PLAN="bugout-managed-plan"
API_APP_NAME="bugout-managed-api"        # Must be globally unique
ADMIN_APP_NAME="bugout-managed-admin"    # Must be globally unique
JWT_SECRET="BugOutManaged2026SecretKeyMustBeAtLeast256BitsLong!"  # Change this!

echo "=== Creating Resource Group ==="
az group create --name $RESOURCE_GROUP --location $LOCATION

echo "=== Creating Azure SQL Server ==="
az sql server create \
  --name $SQL_SERVER_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --admin-user $SQL_ADMIN_USER \
  --admin-password $SQL_ADMIN_PASSWORD

echo "=== Creating Azure SQL Database ==="
az sql db create \
  --resource-group $RESOURCE_GROUP \
  --server $SQL_SERVER_NAME \
  --name $SQL_DB_NAME \
  --service-objective S0

echo "=== Allow Azure services to access SQL ==="
az sql server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --server $SQL_SERVER_NAME \
  --name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

echo "=== Creating App Service Plan ==="
az appservice plan create \
  --name $APP_SERVICE_PLAN \
  --resource-group $RESOURCE_GROUP \
  --sku B1 \
  --is-linux

echo "=== Creating API App Service ==="
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --name $API_APP_NAME \
  --runtime "DOTNETCORE:10.0"

echo "=== Configuring API App Settings ==="
CONNECTION_STRING="Server=tcp:${SQL_SERVER_NAME}.database.windows.net,1433;Database=${SQL_DB_NAME};User ID=${SQL_ADMIN_USER};Password=${SQL_ADMIN_PASSWORD};Encrypt=True;TrustServerCertificate=False;"

az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $API_APP_NAME \
  --settings \
    "ConnectionStrings__DefaultConnection=$CONNECTION_STRING" \
    "BugOutManaged__Jwt__Secret=$JWT_SECRET" \
    "BugOutManaged__Jwt__ExpirationMs=86400000" \
    "BugOutManaged__VideoStoragePath=/home/videos" \
    "BugOutManaged__Cors__AllowedOrigins=https://${ADMIN_APP_NAME}.azurewebsites.net,https://${ADMIN_APP_NAME}.azurestaticapps.net"

echo "=== Creating Static Web App for Admin Dashboard ==="
az staticwebapp create \
  --name $ADMIN_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

echo ""
echo "=== DONE ==="
echo ""
echo "Resources created:"
echo "  API:       https://${API_APP_NAME}.azurewebsites.net"
echo "  Dashboard: https://${ADMIN_APP_NAME}.azurestaticapps.net"
echo "  SQL:       ${SQL_SERVER_NAME}.database.windows.net"
echo ""
echo "Next steps:"
echo "  1. Get the API publish profile:  az webapp deployment list-publishing-profiles --name $API_APP_NAME --resource-group $RESOURCE_GROUP --xml"
echo "  2. Add it as GitHub secret:      AZURE_WEBAPP_PUBLISH_PROFILE"
echo "  3. Get Static Web App token:     az staticwebapp secrets list --name $ADMIN_APP_NAME --resource-group $RESOURCE_GROUP"
echo "  4. Add it as GitHub secret:      AZURE_STATIC_WEB_APPS_TOKEN"
echo "  5. Push to main branch to trigger deploy"
echo ""
echo "Widget apiUrl for your apps:  https://${API_APP_NAME}.azurewebsites.net/api"
