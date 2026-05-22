import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;
  console.log(`Updated scopes: ${current.toString()}`);

  return new Response();
};
