import {authenticate, unauthenticated} from "../shopify.server";
import {getAttributionOptions} from "../models/attribution-settings.server";

export const loader = async ({request}) => {
  const {session} = await authenticate.public.appProxy(request);
  const shop = session?.shop || new URL(request.url).searchParams.get("shop");
  let options;

  try {
    const {admin} = await unauthenticated.admin(shop);
    options = await getAttributionOptions(admin);
  } catch {
    options = await getAttributionOptions();
  }

  return Response.json({options});
};

export const action = async ({request}) => {
  const {session} = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  let data;
  try {
    data = JSON.parse(await request.text());
  } catch {
    return Response.json({error: "Invalid JSON"}, {status: 400});
  }

  const shop = session?.shop || data.shop || url.searchParams.get("shop");

  if (!shop || !data.orderId || !data.surveyAttributionName) {
    return Response.json({error: "Missing required fields"}, {status: 400});
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
      return Response.json({error: errors[0].message}, {status: 422});
    }
  } catch (error) {
    console.error("Failed to write order metafields:", error);
    return Response.json({error: "Failed to save attribution"}, {status: 500});
  }

  return Response.json({ok: true});
};
