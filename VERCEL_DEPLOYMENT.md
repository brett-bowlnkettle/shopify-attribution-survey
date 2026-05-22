# Vercel deployment

This app is a Shopify embedded app. Shopify hosts the admin shell and deployed extensions, but the React Router web app must be hosted on a public HTTPS URL such as Vercel.

## Vercel project settings

If you import the parent repository into Vercel, set the project root directory to:

```txt
attribution-survey
```

Use the default install command, or set it explicitly:

```sh
npm install
```

Use this build command:

```sh
npm run build
```

Do not set an output directory manually. The `@vercel/react-router` preset handles the React Router server build for Vercel.

## Environment variables

Set these in Vercel Project Settings > Environment Variables:

```txt
NODE_ENV=production
SHOPIFY_API_KEY=<your Shopify app client ID>
SHOPIFY_API_SECRET=<your Shopify app client secret>
SHOPIFY_APP_URL=https://<your-vercel-domain>
SCOPES=read_orders,write_app_proxy,write_orders,write_products
```

`SHOPIFY_API_KEY` should match `client_id` in `shopify.app.toml`. `SHOPIFY_APP_URL` must be the exact production URL Vercel gives you, without a trailing slash.

## Shopify app config

After Vercel gives you a production URL, update `shopify.app.toml`:

```toml
application_url = "https://<your-vercel-domain>"

[auth]
redirect_urls = [
  "https://<your-vercel-domain>/auth/callback",
]
```

Then deploy the Shopify app config:

```sh
npm run deploy
```

## Production session storage

This app currently uses in-memory session storage in `app/shopify.server.js`. That is not production-safe on Vercel because serverless instances can restart or scale independently.

Before real merchant use, replace `MemorySessionStorage` with persistent session storage, such as Prisma backed by Vercel Postgres, Neon, Supabase, or another hosted database.
