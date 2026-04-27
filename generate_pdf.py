from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER

doc = SimpleDocTemplate(
    "BugOut_Managed_Azure_Deployment_Guide.pdf",
    pagesize=letter,
    topMargin=0.75*inch,
    bottomMargin=0.75*inch,
    leftMargin=0.85*inch,
    rightMargin=0.85*inch,
)

styles = getSampleStyleSheet()

# Custom styles
styles.add(ParagraphStyle(name='DocTitle', parent=styles['Title'], fontSize=22, spaceAfter=6,
                           textColor=HexColor('#1a1a2e')))
styles.add(ParagraphStyle(name='Subtitle', parent=styles['Normal'], fontSize=11, spaceAfter=20,
                           textColor=HexColor('#666666'), alignment=TA_CENTER))
styles.add(ParagraphStyle(name='H1', parent=styles['Heading1'], fontSize=16, spaceBefore=20, spaceAfter=8,
                           textColor=HexColor('#1a1a2e'), borderPadding=(0,0,4,0)))
styles.add(ParagraphStyle(name='H2', parent=styles['Heading2'], fontSize=13, spaceBefore=14, spaceAfter=6,
                           textColor=HexColor('#333333')))
styles.add(ParagraphStyle(name='Body', parent=styles['Normal'], fontSize=10, leading=14, spaceAfter=6))
styles.add(ParagraphStyle(name='BulletItem', parent=styles['Normal'], fontSize=10, leading=14, leftIndent=20,
                           bulletIndent=10, spaceAfter=3))
styles.add(ParagraphStyle(name='CodeBlock', parent=styles['Normal'], fontSize=8.5, leading=11,
                           fontName='Courier', backColor=HexColor('#f0f0f0'), leftIndent=12,
                           rightIndent=12, spaceBefore=4, spaceAfter=4, borderPadding=6))
styles.add(ParagraphStyle(name='Important', parent=styles['Normal'], fontSize=10, leading=14,
                           textColor=HexColor('#c0392b'), fontName='Helvetica-Bold', leftIndent=12,
                           spaceBefore=4, spaceAfter=4))
styles.add(ParagraphStyle(name='Note', parent=styles['Normal'], fontSize=9, leading=12,
                           textColor=HexColor('#555555'), fontName='Helvetica-Oblique', leftIndent=12,
                           spaceBefore=2, spaceAfter=6))

story = []

# Title page
story.append(Spacer(1, 1.5*inch))
story.append(Paragraph("Bug Out Managed", styles['DocTitle']))
story.append(Paragraph("Azure Deployment Guide", styles['Subtitle']))
story.append(Spacer(1, 0.3*inch))
story.append(HRFlowable(width="60%", thickness=2, color=HexColor('#4caf50')))
story.append(Spacer(1, 0.3*inch))
story.append(Paragraph("Step-by-step instructions to deploy the Bug Out Managed platform to Azure.", styles['Body']))
story.append(Spacer(1, 0.5*inch))

# What you're deploying
story.append(Paragraph("What You're Deploying", styles['H1']))
story.append(Paragraph("<bullet>&bull;</bullet><b>Bug Out Managed API</b> - ASP.NET Core backend (Azure App Service)", styles['BulletItem']))
story.append(Paragraph("<bullet>&bull;</bullet><b>Bug Out Managed Dashboard</b> - React admin portal (Azure Static Web App)", styles['BulletItem']))
story.append(Paragraph("<bullet>&bull;</bullet><b>Azure SQL Database</b> - SQL Server database (managed)", styles['BulletItem']))
story.append(Spacer(1, 6))
story.append(Paragraph("Once deployed, all our apps (Financials Managed, HDD Managed, Facilities Managed, etc.) will send bug reports and feature requests to this central platform.", styles['Body']))

# Prerequisites
story.append(Paragraph("Prerequisites", styles['H1']))
story.append(Paragraph("Before you start, make sure you have:", styles['Body']))
story.append(Paragraph("<bullet>1.</bullet><b>Azure account</b> with an active subscription", styles['BulletItem']))
story.append(Paragraph("<bullet>2.</bullet><b>Azure CLI</b> installed - https://learn.microsoft.com/en-us/cli/azure/install-azure-cli", styles['BulletItem']))
story.append(Paragraph("<bullet>3.</bullet><b>Git</b> installed", styles['BulletItem']))
story.append(Paragraph("<bullet>4.</bullet><b>Node.js 20+</b> installed - https://nodejs.org", styles['BulletItem']))
story.append(Paragraph("<bullet>5.</bullet><b>.NET 10 SDK</b> installed - https://dotnet.microsoft.com/download", styles['BulletItem']))
story.append(Paragraph("<bullet>6.</bullet>Access to the GitHub repo", styles['BulletItem']))

# Step 1
story.append(Paragraph("Step 1: Clone the Repo", styles['H1']))
story.append(Paragraph("git clone https://github.com/larry0467/bugout-managed-sqlserver-aspnet-react.git<br/>cd bugout-managed-sqlserver-aspnet-react", styles['CodeBlock']))

# Step 2
story.append(Paragraph("Step 2: Log in to Azure", styles['H1']))
story.append(Paragraph("az login", styles['CodeBlock']))
story.append(Paragraph("This opens a browser window. Sign in with the Azure account.", styles['Body']))

# Step 3
story.append(Paragraph("Step 3: Create Azure Resources", styles['H1']))
story.append(Paragraph("Run these commands one at a time. Replace the password and names if needed.", styles['Body']))

story.append(Paragraph("3a. Create a Resource Group", styles['H2']))
story.append(Paragraph("az group create --name bugout-managed-rg --location eastus", styles['CodeBlock']))

story.append(Paragraph("3b. Create Azure SQL Server", styles['H2']))
story.append(Paragraph("az sql server create \\<br/>  --name bugout-managed-sql \\<br/>  --resource-group bugout-managed-rg \\<br/>  --location eastus \\<br/>  --admin-user bugoutadmin \\<br/>  --admin-password \"BugOutManaged2026!\"", styles['CodeBlock']))
story.append(Paragraph("IMPORTANT: Save this password. You will need it in Step 5.", styles['Important']))

story.append(Paragraph("3c. Create the Database", styles['H2']))
story.append(Paragraph("az sql db create \\<br/>  --resource-group bugout-managed-rg \\<br/>  --server bugout-managed-sql \\<br/>  --name bugout_managed \\<br/>  --service-objective S0", styles['CodeBlock']))

story.append(Paragraph("3d. Allow Azure Services to Access the Database", styles['H2']))
story.append(Paragraph("az sql server firewall-rule create \\<br/>  --resource-group bugout-managed-rg \\<br/>  --server bugout-managed-sql \\<br/>  --name AllowAzureServices \\<br/>  --start-ip-address 0.0.0.0 \\<br/>  --end-ip-address 0.0.0.0", styles['CodeBlock']))

story.append(Paragraph("3e. Create App Service Plan", styles['H2']))
story.append(Paragraph("az appservice plan create \\<br/>  --name bugout-managed-plan \\<br/>  --resource-group bugout-managed-rg \\<br/>  --sku B1 \\<br/>  --is-linux", styles['CodeBlock']))

story.append(Paragraph("3f. Create the API App Service", styles['H2']))
story.append(Paragraph("az webapp create \\<br/>  --resource-group bugout-managed-rg \\<br/>  --plan bugout-managed-plan \\<br/>  --name bugout-managed-api \\<br/>  --runtime \"DOTNETCORE:10.0\"", styles['CodeBlock']))
story.append(Paragraph("NOTE: The name bugout-managed-api must be globally unique. If taken, use something like bugout-managed-api-yourcompany.", styles['Note']))

# Step 4
story.append(Paragraph("Step 4: Create the Static Web App for the Dashboard", styles['H1']))
story.append(Paragraph("az staticwebapp create \\<br/>  --name bugout-managed-admin \\<br/>  --resource-group bugout-managed-rg \\<br/>  --location eastus", styles['CodeBlock']))

# Step 5
story.append(Paragraph("Step 5: Configure the API", styles['H1']))
story.append(Paragraph("This sets the database connection, JWT secret, and CORS origins.", styles['Body']))
story.append(Paragraph(
    "az webapp config appsettings set \\<br/>"
    "  --resource-group bugout-managed-rg \\<br/>"
    "  --name bugout-managed-api \\<br/>"
    "  --settings \\<br/>"
    "  \"ConnectionStrings__DefaultConnection=Server=tcp:bugout-managed-sql.database.windows.net,1433;"
    "Database=bugout_managed;User ID=bugoutadmin;Password=BugOutManaged2026!;"
    "Encrypt=True;TrustServerCertificate=False;\" \\<br/>"
    "  \"BugOutManaged__Jwt__Secret=BugOutManaged2026SecretKeyMustBeAtLeast256BitsLong!\" \\<br/>"
    "  \"BugOutManaged__Jwt__ExpirationMs=86400000\" \\<br/>"
    "  \"BugOutManaged__VideoStoragePath=/home/videos\" \\<br/>"
    "  \"BugOutManaged__Cors__AllowedOrigins=https://bugout-managed-admin.azurestaticapps.net,"
    "https://financials.protocall.co,https://hdd.protocall.co\"",
    styles['CodeBlock']))
story.append(Paragraph("IMPORTANT: Update the CORS origins to include all your app domains. Comma-separated, no spaces.", styles['Important']))

# Step 6
story.append(Paragraph("Step 6: Deploy the API", styles['H1']))
story.append(Paragraph("Option A: Deploy from command line (quickest)", styles['H2']))
story.append(Paragraph(
    "cd BugOutManaged.Api<br/>"
    "dotnet publish -c Release -o ./publish<br/>"
    "cd publish<br/>"
    "zip -r ../deploy.zip .<br/>"
    "cd ..<br/><br/>"
    "az webapp deployment source config-zip \\<br/>"
    "  --resource-group bugout-managed-rg \\<br/>"
    "  --name bugout-managed-api \\<br/>"
    "  --src deploy.zip", styles['CodeBlock']))

story.append(Paragraph("Option B: Set up GitHub Actions (auto-deploy on every push)", styles['H2']))
story.append(Paragraph("<bullet>1.</bullet>Get the publish profile:", styles['BulletItem']))
story.append(Paragraph("az webapp deployment list-publishing-profiles \\<br/>  --name bugout-managed-api \\<br/>  --resource-group bugout-managed-rg \\<br/>  --xml &gt; publish-profile.xml", styles['CodeBlock']))
story.append(Paragraph("<bullet>2.</bullet>Go to the GitHub repo &gt; Settings &gt; Secrets and variables &gt; Actions", styles['BulletItem']))
story.append(Paragraph("<bullet>3.</bullet>Create a new secret: Name: <b>AZURE_WEBAPP_PUBLISH_PROFILE</b>, Value: paste the entire contents of publish-profile.xml", styles['BulletItem']))
story.append(Paragraph("<bullet>4.</bullet>Delete the local file: <b>rm publish-profile.xml</b>", styles['BulletItem']))

# Step 7
story.append(Paragraph("Step 7: Deploy the Admin Dashboard", styles['H1']))
story.append(Paragraph("7a. Build the dashboard", styles['H2']))
story.append(Paragraph("cd bugout-managed-admin<br/>npm install<br/>npm run build", styles['CodeBlock']))

story.append(Paragraph("7b. Get the Static Web App deployment token", styles['H2']))
story.append(Paragraph("az staticwebapp secrets list \\<br/>  --name bugout-managed-admin \\<br/>  --resource-group bugout-managed-rg \\<br/>  --query \"properties.apiKey\" -o tsv", styles['CodeBlock']))

story.append(Paragraph("7c. Install the SWA CLI and deploy", styles['H2']))
story.append(Paragraph("npm install -g @azure/static-web-apps-cli<br/><br/>swa deploy ./dist \\<br/>  --deployment-token &lt;paste-token-from-step-7b&gt; \\<br/>  --env production", styles['CodeBlock']))

story.append(Paragraph("7d. (Optional) Set up GitHub Actions for auto-deploy", styles['H2']))
story.append(Paragraph("<bullet>1.</bullet>Go to GitHub repo &gt; Settings &gt; Secrets &gt; Actions", styles['BulletItem']))
story.append(Paragraph("<bullet>2.</bullet>Create secret: Name: <b>AZURE_STATIC_WEB_APPS_TOKEN</b>, Value: the token from step 7b", styles['BulletItem']))
story.append(Paragraph("<bullet>3.</bullet>Now every push to master auto-deploys both the API and dashboard.", styles['BulletItem']))

# Step 8
story.append(Paragraph("Step 8: Verify the Deployment", styles['H1']))
story.append(Paragraph("<bullet>1.</bullet><b>API health check:</b> Open https://bugout-managed-api.azurewebsites.net/api/auth/me in a browser. You should see: {\"error\":\"Missing or invalid Authorization header\"} - That means the API is running!", styles['BulletItem']))
story.append(Paragraph("<bullet>2.</bullet><b>Dashboard:</b> Open https://bugout-managed-admin.azurestaticapps.net - You should see the login page.", styles['BulletItem']))
story.append(Paragraph("<bullet>3.</bullet><b>Register your admin account:</b> Click Register, enter your name, email, password, organization name.", styles['BulletItem']))
story.append(Paragraph("<bullet>4.</bullet><b>Create projects for each app:</b> Go to Applications &gt; New Project. Create: Financials Managed, HDD Managed, Facilities Managed, etc. Copy each API key.", styles['BulletItem']))

# Step 9
story.append(Paragraph("Step 9: Connect Your Apps", styles['H1']))
story.append(Paragraph("For each app (Financials Managed, HDD Managed, etc.):", styles['Body']))

story.append(Paragraph("9a. Copy the widget files into the app", styles['H2']))
story.append(Paragraph("Copy these two files from the repo into the app's src/components/ folder:", styles['Body']))
story.append(Paragraph("<bullet>&bull;</bullet>bugout-managed-widget/src/BugOutManagedWidget.tsx", styles['BulletItem']))
story.append(Paragraph("<bullet>&bull;</bullet>bugout-managed-widget/src/types.ts (rename to BugOutManagedTypes.ts)", styles['BulletItem']))
story.append(Spacer(1, 4))
story.append(Paragraph("Update the import in BugOutManagedWidget.tsx:", styles['Body']))
story.append(Paragraph("// Change this:<br/>import type { BugOutManagedConfig } from './types';<br/>// To this:<br/>import type { BugOutManagedConfig } from './BugOutManagedTypes';", styles['CodeBlock']))

story.append(Paragraph("9b. Add the widget to the app", styles['H2']))
story.append(Paragraph("In the app's main layout component (e.g., App.tsx):", styles['Body']))
story.append(Paragraph(
    "import BugOutManagedWidget from './components/BugOutManagedWidget';<br/><br/>"
    "// Inside the JSX, near the closing tags:<br/>"
    "&lt;BugOutManagedWidget<br/>"
    "  apiKey=\"bom_PASTE_API_KEY_FROM_STEP_8\"<br/>"
    "  apiUrl=\"https://bugout-managed-api.azurewebsites.net/api\"<br/>"
    "  userEmail={currentUser.email}<br/>"
    "  userName={currentUser.name}<br/>"
    "  tenantName={currentTenant.name}<br/>"
    "  tenantId={currentTenant.id}<br/>"
    "  databaseName={currentTenant.dbName}<br/>"
    "  appVersion=\"1.0.0\"<br/>"
    "  environment=\"PRODUCTION\"<br/>"
    "  theme=\"dark\"<br/>"
    "  position=\"bottom-right\"<br/>"
    "/>", styles['CodeBlock']))
story.append(Paragraph("Replace currentUser and currentTenant with however your app tracks the logged-in user and selected company/tenant.", styles['Note']))

story.append(Paragraph("9c. Deploy the app", styles['H2']))
story.append(Paragraph("Deploy your app as usual. The widget will now send bug reports to the central Bug Out Managed dashboard.", styles['Body']))

# Step 10
story.append(Paragraph("Step 10: Add Team Members", styles['H1']))
story.append(Paragraph("<bullet>1.</bullet>Log in to the Bug Out Managed dashboard", styles['BulletItem']))
story.append(Paragraph("<bullet>2.</bullet>Go to <b>Team</b> in the sidebar", styles['BulletItem']))
story.append(Paragraph("<bullet>3.</bullet>Click <b>Add Team Member</b>", styles['BulletItem']))
story.append(Paragraph("<bullet>4.</bullet>Enter their name, email, temporary password, and role:", styles['BulletItem']))
story.append(Paragraph("<bullet>&nbsp;&nbsp;&bull;</bullet><b>Platform Admin</b> - full access, can manage team and all projects", styles['BulletItem']))
story.append(Paragraph("<bullet>&nbsp;&nbsp;&bull;</bullet><b>Project Admin</b> - can manage tickets and projects", styles['BulletItem']))
story.append(Paragraph("<bullet>&nbsp;&nbsp;&bull;</bullet><b>Viewer</b> - read-only", styles['BulletItem']))
story.append(Paragraph("<bullet>5.</bullet>Share their login credentials. They log in at the dashboard URL.", styles['BulletItem']))

# Step 11
story.append(Paragraph("Step 11: Configure Slack (Optional)", styles['H1']))
story.append(Paragraph("<bullet>1.</bullet>Go to <b>Settings</b> in the dashboard", styles['BulletItem']))
story.append(Paragraph("<bullet>2.</bullet>Select the project (e.g., \"Financials Managed\")", styles['BulletItem']))
story.append(Paragraph("<bullet>3.</bullet>Paste your <b>Slack Incoming Webhook URL</b>", styles['BulletItem']))
story.append(Paragraph("<bullet>4.</bullet>Enter the <b>Slack channel</b> name (e.g., #bugout-financials)", styles['BulletItem']))
story.append(Paragraph("<bullet>5.</bullet>Click <b>Save</b>", styles['BulletItem']))
story.append(Spacer(1, 6))
story.append(Paragraph("Now all ticket chat messages will sync to Slack.", styles['Body']))
story.append(Spacer(1, 6))
story.append(Paragraph("For inbound messages from Slack:", styles['Body']))
story.append(Paragraph("<bullet>1.</bullet>Create a Slack App at https://api.slack.com/apps", styles['BulletItem']))
story.append(Paragraph("<bullet>2.</bullet>Add slash command: /bugout-chat pointing to https://bugout-managed-api.azurewebsites.net/api/slack/command", styles['BulletItem']))
story.append(Paragraph("<bullet>3.</bullet>Install the app to your workspace", styles['BulletItem']))
story.append(Spacer(1, 6))
story.append(Paragraph("Usage: /bugout-chat 42 Looking into this now - posts a note to ticket #42.", styles['Note']))

# Summary URLs
story.append(Paragraph("Summary of URLs", styles['H1']))
url_data = [
    ['Resource', 'URL'],
    ['API', 'https://bugout-managed-api.azurewebsites.net'],
    ['Dashboard', 'https://bugout-managed-admin.azurestaticapps.net'],
    ['Widget API URL', 'https://bugout-managed-api.azurewebsites.net/api'],
]
url_table = Table(url_data, colWidths=[1.8*inch, 4.5*inch])
url_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HexColor('#1a1a2e')),
    ('TEXTCOLOR', (0, 0), (-1, 0), HexColor('#ffffff')),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#cccccc')),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor('#ffffff'), HexColor('#f5f5f5')]),
]))
story.append(url_table)

# Troubleshooting
story.append(Paragraph("Troubleshooting", styles['H1']))
story.append(Paragraph("<b>\"CORS error\" in browser console:</b>", styles['Body']))
story.append(Paragraph("Add the app's domain to the CORS setting in Step 5. No redeploy needed - app settings take effect immediately.", styles['Note']))
story.append(Paragraph("<b>\"Invalid API key\" when widget submits:</b>", styles['Body']))
story.append(Paragraph("Make sure the API key in the widget matches the one shown in Applications for that project.", styles['Note']))
story.append(Paragraph("<b>Dashboard shows empty projects:</b>", styles['Body']))
story.append(Paragraph("Make sure you're logged in with the same account that created the projects.", styles['Note']))
story.append(Paragraph("<b>Database connection fails:</b>", styles['Body']))
story.append(Paragraph("Verify the firewall rule in Step 3d was created. Check the connection string password matches.", styles['Note']))

# Cost
story.append(Paragraph("Cost Estimate (Azure)", styles['H1']))
cost_data = [
    ['Resource', 'SKU', 'Monthly Cost'],
    ['App Service (API)', 'B1', '~$13'],
    ['Azure SQL', 'S0', '~$15'],
    ['Static Web App (Dashboard)', 'Free', '$0'],
    ['Total', '', '~$28/month'],
]
cost_table = Table(cost_data, colWidths=[2.5*inch, 1.5*inch, 1.5*inch])
cost_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HexColor('#1a1a2e')),
    ('TEXTCOLOR', (0, 0), (-1, 0), HexColor('#ffffff')),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#cccccc')),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor('#ffffff'), HexColor('#f5f5f5')]),
    ('BACKGROUND', (0, -1), (-1, -1), HexColor('#e8f5e9')),
]))
story.append(cost_table)
story.append(Spacer(1, 8))
story.append(Paragraph("You can scale up later if needed. The S0 SQL tier handles hundreds of concurrent users.", styles['Body']))

doc.build(story)
print("PDF generated successfully!")
