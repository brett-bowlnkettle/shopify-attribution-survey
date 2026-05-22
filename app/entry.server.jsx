import { handleRequest as handleVercelRequest } from "@vercel/react-router/entry.server";
import { addDocumentResponseHeaders } from "./shopify.server";

export { streamTimeout } from "@vercel/react-router/entry.server";

export default function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  reactRouterContext,
  loadContext,
  options,
) {
  addDocumentResponseHeaders(request, responseHeaders);

  return handleVercelRequest(
    request,
    responseStatusCode,
    responseHeaders,
    reactRouterContext,
    loadContext,
    options,
  );
}
