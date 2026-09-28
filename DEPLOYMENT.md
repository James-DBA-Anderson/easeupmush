# Deployment Guide

This repository uses the new Cloudflare `cf` CLI for automated deployments to Cloudflare Pages.

## Automated Deployment

Every push to `main` triggers an automated deployment via GitHub Actions.

### Workflow Overview

The deployment workflow (`.github/workflows/deploy.yml`) performs:

1. **Checkout**: Fetches the repository code
2. **Setup**: Installs Node.js 22 and npm dependencies
3. **Build**: Runs `npm run build` to compile all apps into `dist/`
4. **Deploy**: Uses `cf deploy` to publish to Cloudflare Pages
5. **Output**: Displays deployment URL

## Required GitHub Secrets

For automated deployment to work, configure these secrets in your GitHub repository:

### 1. CLOUDFLARE_API_TOKEN

A Cloudflare API token with permissions to deploy to Pages.

**How to create:**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the "Edit Cloudflare Workers" template or create a custom token with:
   - **Permissions:**
     - Account → Cloudflare Pages → Edit
     - Account → Account Settings → Read
   - **Account Resources:** Include your account
4. Copy the token and add it to GitHub:
   - Go to your repo's Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: Paste your token

### 2. CLOUDFLARE_ACCOUNT_ID

Your Cloudflare account ID.

**How to find it:**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select your account
3. Your Account ID is shown in the right sidebar under "Account ID"
4. Add it to GitHub as a secret:
   - Settings → Secrets and variables → Actions
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Value: Your account ID

## Manual Deployment

To deploy manually from your local machine:

```bash
npm run deploy
```

**Prerequisites:**
- Set `CLOUDFLARE_API_TOKEN` environment variable
- Set `CLOUDFLARE_ACCOUNT_ID` environment variable

Example:
```bash
export CLOUDFLARE_API_TOKEN="your-token-here"
export CLOUDFLARE_ACCOUNT_ID="your-account-id-here"
npm run deploy
```

## Configuration

The deployment is configured via `cloudflare.config.ts`:

```typescript
import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "easeupmush",
    compatibilityDate: "2026-08-15",
    assets: {
      directory: "./dist",
    },
  },
});
```

### Key Settings

- **name**: The project name on Cloudflare Pages (`easeupmush`)
- **compatibilityDate**: The Cloudflare Workers compatibility date
- **assets.directory**: The built static assets directory (`./dist`)

## Cloudflare Free Tier

This deployment configuration is compatible with Cloudflare's free tier:

- ✅ Static site hosting
- ✅ Unlimited bandwidth
- ✅ Unlimited requests
- ✅ Custom domain (easeupmush.com)
- ✅ Automatic HTTPS
- ✅ Global CDN

## Troubleshooting

### Deployment fails with "Unauthorized"

Check that your `CLOUDFLARE_API_TOKEN` has the correct permissions and hasn't expired.

### Deployment fails with "Account not found"

Verify your `CLOUDFLARE_ACCOUNT_ID` is correct.

### Build succeeds but deploy fails

Check the GitHub Actions logs for specific error messages from the `cf deploy` command.

## Migration from Wrangler

This project was migrated from the legacy Wrangler configuration:

- ❌ Old: `wrangler.jsonc` (JSONC format)
- ✅ New: `cloudflare.config.ts` (TypeScript format)

The new `cf` CLI offers:
- TypeScript-based configuration with type safety
- JSON-first output for better CI/CD integration
- Access to 3,000+ Cloudflare API operations
- Better agent/automation support
- Improved error messages and debugging

## Learn More

- [Cloudflare cf CLI announcement](https://blog.cloudflare.com/cloudflare-cf-cli-launch/)
- [Cloudflare Pages documentation](https://developers.cloudflare.com/pages/)
- [cf CLI GitHub repository](https://github.com/cloudflare/workers-sdk)
