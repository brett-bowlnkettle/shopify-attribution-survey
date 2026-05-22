import {authenticate, unauthenticated} from "../shopify.server";
import {getAttributionOptions} from "../models/attribution-settings.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain",
};

export const loader = async ({request}) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {status: 204, headers: CORS_HEADERS});
  }

  let session = null;
  try {
    ({session} = await authenticate.public.appProxy(request));
  } catch {
    // direct call, not through App Proxy
  }
  const shop = session?.shop || new URL(request.url).searchParams.get("shop");
  let options;

  try {
    const {admin} = await unauthenticated.admin(shop);
    options = await getAttributionOptions(admin);
  } catch {
    options = await getAttributionOptions();
  }

  return Response.json({options}, {headers: CORS_HEADERS});
};

export const action = async ({request}) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {status: 204, headers: CORS_HEADERS});
  }

  let session = null;
  try {
    ({session} = await authenticate.public.appProxy(request));
  } catch {
    // direct call, not through App Proxy
  }

  const url = new URL(request.url);
  let data;
  try {
    data = JSON.parse(await request.text());
  } catch {
    return Response.json({error: "Invalid JSON"}, {status: 400, headers: CORS_HEADERS});
  }

  const shop = session?.shop || data.shop || url.searchParams.get("shop");

  if (!shop || !data.orderId || !data.surveyAttributionName) {
    return Response.json({error: "Missing required fields"}, {status: 400, headers: CORS_HEADERS});
  }

  try {
    const {admin} = await unauthenticated.admin(shop);

    const metafields = [
      {
        ownerId: data.orderId,
        namespace: "survey_attribution",
        key: "attribution_name",
        type: "single_line_text_field",
        value: data.surveyAttributionName,
      },
    ];

    if (data.surveyAttributionDetails) {
      metafields.push({
        ownerId: data.orderId,
        namespace: "survey_attribution",
        key: "attribution_details",
        type: "single_line_text_field",
        value: data.surveyAttributionDetails,
      });
    }

    const res = await admin.graphql(
      `#graphql
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }`,
      {variables: {metafields}},
    );

    const json = await res.json();
    const errors = json.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length > 0) {
      console.error("Metafield write errors:", errors);
      return Response.json({error: errors[0].message}, {status: 422, headers: CORS_HEADERS});
    }
  } catch (error) {
    console.error("Failed to write order metafields:", error);
    return Response.json({error: "Failed to save attribution"}, {status: 500, headers: CORS_HEADERS});
  }

  return Response.json({ok: true}, {headers: CORS_HEADERS});
};
