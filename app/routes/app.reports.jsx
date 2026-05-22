import {useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {boundary} from "@shopify/shopify-app-react-router/server";

export const loader = async ({request}) => {
  const {admin} = await authenticate.admin(request);

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const dateStr = since.toISOString().slice(0, 10);
  const dateQuery = `created_at:>='${dateStr}'`;

  // Total orders in 30 days (for response rate denominator)
  let totalOrders = 0;
  try {
    const res = await admin.graphql(
      `#graphql
      query OrdersCount($query: String!) {
        ordersCount(query: $query) {
          count
        }
      }`,
      {variables: {query: dateQuery}},
    );
    const json = await res.json();
    totalOrders = json.data?.ordersCount?.count ?? 0;
  } catch {
    // fall back to 0
  }

  // Paginate through orders and read attribution metafields
  const attributionMap = new Map();
  let totalResponses = 0;
  let currencyCode = "USD";
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    try {
      const res = await admin.graphql(
        `#graphql
        query OrdersWithAttribution($query: String!, $after: String) {
          orders(first: 250, query: $query, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              currentSubtotalPriceSet {
                shopMoney { amount currencyCode }
              }
              metafield(namespace: "survey_attribution", key: "attribution_name") {
                value
              }
            }
          }
        }`,
        {variables: {query: dateQuery, after: cursor}},
      );
      const json = await res.json();
      const page = json.data?.orders;

      hasNextPage = page?.pageInfo?.hasNextPage ?? false;
      cursor = page?.pageInfo?.endCursor ?? null;

      for (const order of page?.nodes ?? []) {
        const source = order.metafield?.value;
        if (!source) continue;

        totalResponses++;
        const money = order.currentSubtotalPriceSet?.shopMoney;
        if (money?.currencyCode) currencyCode = money.currencyCode;

        if (!attributionMap.has(source)) {
          attributionMap.set(source, {responses: 0, netSales: 0});
        }
        const entry = attributionMap.get(source);
        entry.responses++;
        entry.netSales += parseFloat(money?.amount ?? 0);
      }
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      hasNextPage = false;
    }
  }

  const attributionStats = Array.from(attributionMap.entries())
    .map(([attribution, {responses, netSales}]) => ({attribution, responses, netSales}))
    .sort((a, b) => b.responses - a.responses);

  return {
    totalResponses,
    totalOrders,
    currencyCode,
    attributionStats,
    totalNetSales: attributionStats.reduce((sum, a) => sum + a.netSales, 0),
  };
};

export default function Reports() {
  const {totalResponses, totalOrders, currencyCode, attributionStats, totalNetSales} =
    useLoaderData();

  const responseRate =
    totalOrders > 0
      ? `${((totalResponses / totalOrders) * 100).toFixed(1)}%`
      : "—";

  const fmt = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode || "USD",
    }).format(n);

  return (
    <s-page heading="Reports">
      <s-section heading="Last 30 days">
        <s-stack direction="inline" gap="base">
          <Metric label="Survey responses" value={String(totalResponses)} />
          <Metric label="Total orders" value={String(totalOrders)} />
          <Metric label="Response rate" value={responseRate} />
          <Metric label="Attributed net sales" value={fmt(totalNetSales)} />
        </s-stack>
      </s-section>

      <s-section heading="Top attributions">
        {attributionStats.length === 0 ? (
          <s-text color="subdued">No survey responses in the last 30 days.</s-text>
        ) : (
          <table style={{width: "100%", borderCollapse: "collapse"}}>
            <thead>
              <tr>
                <Th align="left">Source</Th>
                <Th align="right">Responses</Th>
                <Th align="right">Net Sales</Th>
              </tr>
            </thead>
            <tbody>
              {attributionStats.map((stat) => (
                <tr key={stat.attribution}>
                  <Td>{stat.attribution}</Td>
                  <Td align="right">{stat.responses}</Td>
                  <Td align="right">{fmt(stat.netSales)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>
    </s-page>
  );
}

function Metric({label, value}) {
  return (
    <s-stack gap="small-100">
      <s-heading>{value}</s-heading>
      <s-text color="subdued">{label}</s-text>
    </s-stack>
  );
}

const cellStyle = {
  padding: "10px 0",
  borderBottom: "1px solid #e1e3e5",
};

function Th({children, align}) {
  return (
    <th
      style={{
        ...cellStyle,
        textAlign: align,
        fontWeight: 600,
        color: "#6d7175",
        paddingRight: align === "left" ? "24px" : "0",
      }}
    >
      {children}
    </th>
  );
}

function Td({children, align = "left"}) {
  return (
    <td
      style={{
        ...cellStyle,
        textAlign: align,
        paddingRight: align === "left" ? "24px" : "0",
      }}
    >
      {children}
    </td>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
