# Deployment Guide

This repository uses the new Cloudflare `cf` CLI for automated deployments to Cloudflare Pages.

## Automated Deployment

Every push to `main` triggers an automated deployment via GitHub Actions.

### Workflow Overview

The deployment workflow (`.github/workflows/deploy.yml`) performs:

1. **Checkout**: Fetches the repository code
2. **Setup**: Installs Node.js 22 and npm dependencies
3. **Build**: Runs `npm run build` to compile all apps into `dist/`
4. **Deploy**: Runs `npm ci` and then `cf deploy` inside `deploy/` to publish to Cloudflare
5. **Output**: Displays deployment URL

`cf deploy` refuses to run at the root of an npm workspace, so the deploy config lives in `deploy/`. That folder is a standalone package (not one of the workspaces) with its own lockfile for `cf` and `wrangler`, and it deploys the pre-built `../dist` directory.

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

The Worker is configured via `deploy/cloudflare.config.ts`:

```typescript
import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "easeupmush",
    compatibilityDate: "2026-08-15",
  },
});
```

The static assets folder is not a `cloudflare.config.ts` key (`worker.assets.directory` is rejected). It is set in the tooling config `deploy/wrangler.config.ts`:

```typescript
import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
  assetsDirectory: "../dist",
});
```

### Key Settings

- **name**: The Worker name on Cloudflare (`easeupmush`)
- **compatibilityDate**: The Cloudflare Workers compatibility date
- **assetsDirectory**: The built static assets directory (`../dist`, relative to `deploy/`)

To check a deploy without uploading, run `npm run build && npm ci --prefix deploy && npm run deploy --prefix deploy -- --dry-run`.

### "run in the root of a workspace"

This is the error you get if `cf deploy` is run from the repo root. Run it from `deploy/` instead.

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

### `Unknown argument: json`

`cf deploy` does not accept `--json`. Generated API commands such as `cf workers get` print JSON on stdout by default; the deploy workflow uses that after a successful deploy to record the Worker URL.

## Migration from Wrangler

This project was migrated from the legacy Wrangler configuration:

- ❌ Old: `wrangler.jsonc` (JSONC format)
- ✅ New: `deploy/cloudflare.config.ts` + `deploy/wrangler.config.ts` (TypeScript format)

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
