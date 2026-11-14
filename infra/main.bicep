// FellowPilot Prevocational — beta infrastructure (one resource group, Australia East). Same shape as MCQ Coach's.
// Deploy:  az deployment group create -g <rg> -f infra/main.bicep -p infra/main.parameters.json -p postgresAdminPassword=...
//
// What it creates
//   Log Analytics + Application Insights   monitoring and error tracking
//   Key Vault (access policies)            database URL, session secret, email connection string
//   PostgreSQL Flexible Server 16          Burstable B1ms, 35-day backups, TLS required, pgcrypto allowed
//   App Service plan + Linux web app       Node 22, managed identity, HTTPS only, health check
//   Communication Services Email           Azure-managed sender domain, data held in Australia
//
// Networking for the beta: Postgres accepts connections from Azure services only, over TLS, with a
// strong password. Move to private networking (VNet integration + private endpoint) before handover.

targetScope = 'resourceGroup'

@description('Azure region. Australia East keeps all data in Australia.')
param location string = 'australiaeast'

@description('Short lowercase name used in resource names.')
@minLength(3)
@maxLength(12)
param appName string = 'fpprevoc'

@description('Environment label used in resource names, e.g. beta or prod.')
@allowed([ 'beta', 'staging', 'prod' ])
param environmentName string = 'beta'

@description('Postgres administrator login (used by migrations only).')
param postgresAdminLogin string = 'fpadmin'

@secure()
@minLength(16)
@description('Postgres administrator password. Pass from a GitHub secret; never commit it.')
param postgresAdminPassword string

@secure()
@minLength(16)
@description('Password for the least-privilege login the web app uses (created by the migration step).')
param postgresAppPassword string

@secure()
@minLength(32)
@description('Secret used to sign session cookies.')
param sessionSecret string

@description('Public URL of the app, used in sign-in emails. Leave blank to use the default azurewebsites.net address.')
param publicUrl string = ''

@secure()
@description('Anthropic API key for the "Ask why" tutor. Leave empty to keep the tutor switched off.')
param anthropicApiKey string = ''

@description('Email of the first admin. Their first sign-in creates the account; they invite everyone else.')
param adminEmail string = ''

@description('App Service plan size. B1 suits the beta; P0v3 adds headroom.')
param appServiceSku string = 'B1'

var suffix = uniqueString(resourceGroup().id)
var base = '${appName}-${environmentName}'
var tags = {
  app: 'fellowpilot-prevoc'
  environment: environmentName
}
var dbName = 'fellowpilot'
var webName = '${base}-web-${suffix}'
var appUrl = empty(publicUrl) ? 'https://${webName}.azurewebsites.net' : publicUrl

// ---------------------------------------------------------------- monitoring
resource logs 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${base}-logs-${suffix}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${base}-ai-${suffix}'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    DisableIpMasking: false
  }
}

// ---------------------------------------------------------------- database
resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2022-12-01' = {
  name: '${base}-pg-${suffix}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32 }
    backup: {
      backupRetentionDays: 35
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
  }
}

resource pgDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2022-12-01' = {
  parent: pg
  name: dbName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// pgcrypto must be allow-listed on Azure before CREATE EXTENSION works.
resource pgExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2022-12-01' = {
  parent: pg
  name: 'azure.extensions'
  properties: {
    value: 'PGCRYPTO'
    source: 'user-override'
  }
}

resource pgTls 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2022-12-01' = {
  parent: pg
  name: 'require_secure_transport'
  properties: {
    value: 'on'
    source: 'user-override'
  }
  dependsOn: [ pgExtensions ]
}

resource pgTimezone 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2022-12-01' = {
  parent: pg
  name: 'timezone'
  properties: {
    value: 'Australia/Adelaide'
    source: 'user-override'
  }
  dependsOn: [ pgTls ]
}

// 0.0.0.0 is Azure's convention for "allow Azure services" (the web app and the deploy job's migration step).
resource pgAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = {
  parent: pg
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ---------------------------------------------------------------- email (sign-in links)
resource emailService 'Microsoft.Communication/emailServices@2023-04-01' = {
  name: '${base}-email-${suffix}'
  location: 'global'
  tags: tags
  properties: {
    dataLocation: 'Australia'
  }
}

resource emailDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  properties: {
    domainManagement: 'AzureManaged'
    userEngagementTracking: 'Disabled'
  }
}

resource comms 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: '${base}-comms-${suffix}'
  location: 'global'
  tags: tags
  properties: {
    dataLocation: 'Australia'
    linkedDomains: [ emailDomain.id ]
  }
}

// ---------------------------------------------------------------- secrets
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: take('${appName}${environmentName}kv${suffix}', 24)
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: false     // access policies: the deploy identity needs only Contributor
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
    enablePurgeProtection: true
    accessPolicies: []
  }
}

var pgHost = pg.properties.fullyQualifiedDomainName

resource secretDbUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-url'
  properties: {
    value: 'postgresql://mcq_web:${uriComponent(postgresAppPassword)}@${pgHost}:5432/${dbName}?sslmode=require'
  }
}

resource secretSession 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'session-secret'
  properties: { value: sessionSecret }
}

resource secretEmail 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'email-connection'
  properties: { value: comms.listKeys().primaryConnectionString }
}

resource secretAnthropic 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(anthropicApiKey)) {
  parent: vault
  name: 'anthropic-api-key'
  properties: { value: anthropicApiKey }
}

// ---------------------------------------------------------------- web app
resource plan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '${base}-plan-${suffix}'
  location: location
  tags: tags
  sku: { name: appServiceSku }
  kind: 'linux'
  properties: { reserved: true }
}

resource web 'Microsoft.Web/sites@2023-01-01' = {
  name: webName
  location: location
  tags: tags
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node server.js'
      alwaysOn: true
      http20Enabled: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      healthCheckPath: '/api/health'
      appSettings: [
        { name: 'NODE_ENV', value: 'production' }
        { name: 'APP_URL', value: appUrl }
        { name: 'APP_ENVIRONMENT', value: environmentName }
        { name: 'TZ', value: 'Australia/Adelaide' }
        { name: 'ADMIN_EMAIL', value: adminEmail }
        { name: 'TENANT_SLUG', value: 'ynlhn' }
        { name: 'ANTHROPIC_API_KEY', value: empty(anthropicApiKey) ? '' : '@Microsoft.KeyVault(VaultName=${vault.name};SecretName=anthropic-api-key)' }
        { name: 'TUTOR_MODEL', value: 'claude-sonnet-5-5' }
        { name: 'TUTOR_DAILY_LIMIT', value: '40' }
        { name: 'DATABASE_URL', value: '@Microsoft.KeyVault(VaultName=${vault.name};SecretName=${secretDbUrl.name})' }
        { name: 'SESSION_SECRET', value: '@Microsoft.KeyVault(VaultName=${vault.name};SecretName=${secretSession.name})' }
        { name: 'EMAIL_CONNECTION', value: '@Microsoft.KeyVault(VaultName=${vault.name};SecretName=${secretEmail.name})' }
        { name: 'EMAIL_SENDER', value: 'DoNotReply@${emailDomain.properties.mailFromSenderDomain}' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
      ]
    }
  }
}

// The web app's identity may read secrets, nothing else.
resource vaultPolicy 'Microsoft.KeyVault/vaults/accessPolicies@2023-07-01' = {
  parent: vault
  name: 'add'
  properties: {
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: web.identity.principalId
        permissions: { secrets: [ 'get', 'list' ] }
      }
    ]
  }
}

resource webLogs 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'to-log-analytics'
  scope: web
  properties: {
    workspaceId: logs.id
    logs: [
      { category: 'AppServiceHTTPLogs', enabled: true }
      { category: 'AppServiceConsoleLogs', enabled: true }
      { category: 'AppServiceAppLogs', enabled: true }
    ]
  }
}

output webAppName string = web.name
output appUrl string = appUrl
output postgresHost string = pgHost
output postgresDatabase string = dbName
output keyVaultName string = vault.name
output emailSender string = 'DoNotReply@${emailDomain.properties.mailFromSenderDomain}'
