import {useEffect, useRef} from "react";
import {useLoaderData, useNavigate, useSearchParams} from "react-router";
import {authenticate} from "../shopify.server";
import {boundary} from "@shopify/shopify-app-react-router/server";

const DATE_RANGES = [
  {value: "today", label: "Today"},
  {value: "7", label: "Last 7 days"},
  {value: "30", label: "Last 30 days"},
  {value: "90", label: "Last 90 days"},
  {value: "365", label: "Last 12 months"},
  {value: "all", label: "All time"},
];

function buildDateQuery(range) {
  if (range === "all") return "";
  const since = new Date();
  if (range === "today") {
    since.setHours(0, 0, 0, 0);
  } else {
    since.setDate(since.getDate() - parseInt(range, 10));
  }
  return `created_at:>='${since.toISOString().slice(0, 10)}'`;
}

export const loader = async ({request}) => {
  const {admin} = await authenticate.admin(request);

  const url = new URL(request.url);
  const range = DATE_RANGES.find((r) => r.value === url.searchParams.get("range"))
    ? url.searchParams.get("range")
    : "30";
  const rangeLabel = DATE_RANGES.find((r) => r.value === range)?.label ?? "Last 30 days";
  const dateQuery = buildDateQuery(range);

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
    range,
    rangeLabel,
  };
};

export default function Reports() {
  const {totalResponses, totalOrders, currencyCode, attributionStats, totalNetSales, range, rangeLabel} =
    useLoaderData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectRef = useRef(null);

  useEffect(() => {
    const select = selectRef.current;
    if (!select) return;
    Array.from(select.querySelectorAll("s-option")).forEach((o) => o.remove());
    DATE_RANGES.forEach((r) => {
      const opt = document.createElement("s-option");
      opt.setAttribute("value", r.value);
      if (r.value === range) opt.setAttribute("selected", "");
      opt.textContent = r.label;
      select.appendChild(opt);
    });
  }, [range]);

  const responseRate =
    totalOrders > 0
      ? `${((totalResponses / totalOrders) * 100).toFixed(1)}%`
      : "—";

  const fmt = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode || "USD",
    }).format(n);

  function handleRangeChange(e) {
    const params = new URLSearchParams(searchParams);
    params.set("range", e.target.value);
    navigate(`?${params.toString()}`);
  }

  return (
    <s-page heading="Reports">
      <s-section heading={rangeLabel}>
        <s-stack gap="base">
          <s-select
            ref={selectRef}
            label="Date ranger"
            name="range"
            onChange={handleRangeChange}
          />
          <s-stack direction="inline" gap="base">
            <Metric label="Survey responses" value={String(totalResponses)} />
            <Metric label="Total orders" value={String(totalOrders)} />
            <Metric label="Response rate" value={responseRate} />
            <Metric label="Attributed net sales" value={fmt(totalNetSales)} />
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Top attributions">
        {attributionStats.length === 0 ? (
          <s-text color="subdued">No survey responses for {rangeLabel.toLowerCase()}.</s-text>
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
