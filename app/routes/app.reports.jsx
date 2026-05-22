import {useEffect, useRef, useState} from "react";
import {useLoaderData, useNavigate} from "react-router";
import {authenticate} from "../shopify.server";
import {boundary} from "@shopify/shopify-app-react-router/server";

const DATE_RANGES = [
  {value: "today", label: "Today"},
  {value: "yesterday", label: "Yesterday"},
  {value: "7", label: "Last 7 days"},
  {value: "30", label: "Last 30 days"},
  {value: "90", label: "Last 90 days"},
  {value: "365", label: "Last 12 months"},
  {value: "custom", label: "Custom range"},
];

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function presetToPickerValue(preset) {
  const today = new Date();
  const to = toDateStr(today);
  if (preset === "today") return `${to}--${to}`;
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return `${toDateStr(y)}--${toDateStr(y)}`;
  }
  const days = parseInt(preset, 10);
  if (!isNaN(days)) {
    const from = new Date(today);
    from.setDate(from.getDate() - days);
    return `${toDateStr(from)}--${to}`;
  }
  return `${to}--${to}`;
}

function buildDateQuery(range, from, to) {
  if (from && to) {
    return `created_at:>='${from}' AND created_at:<='${to}'`;
  }
  if (range === "all" || !range) return "";
  if (range === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return `created_at:>='${toDateStr(d)}'`;
  }
  if (range === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setDate(end.getDate() + 1);
    return `created_at:>='${toDateStr(d)}' AND created_at:<'${toDateStr(end)}'`;
  }
  const since = new Date();
  since.setDate(since.getDate() - parseInt(range, 10));
  return `created_at:>='${toDateStr(since)}'`;
}

export const loader = async ({request}) => {
  const {admin} = await authenticate.admin(request);

  const url = new URL(request.url);
  const rangeParam = url.searchParams.get("range");
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";

  const range =
    from && to
      ? "custom"
      : DATE_RANGES.find((r) => r.value === rangeParam)?.value || "30";

  let rangeLabel;
  if (from && to) {
    const f = new Date(from + "T00:00:00");
    const t = new Date(to + "T00:00:00");
    rangeLabel = `${f.toLocaleDateString("en-US", {month: "short", day: "numeric"})} – ${t.toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"})}`;
  } else {
    rangeLabel = DATE_RANGES.find((r) => r.value === range)?.label ?? "Last 30 days";
  }

  const dateQuery = buildDateQuery(range, from, to);

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
    from,
    to,
  };
};

export default function Reports() {
  const {
    totalResponses,
    totalOrders,
    currencyCode,
    attributionStats,
    totalNetSales,
    range,
    rangeLabel,
    from,
    to,
  } = useLoaderData();
  const navigate = useNavigate();
  const modalRef = useRef(null);
  const datePickerRef = useRef(null);

  const [pendingRange, setPendingRange] = useState(range);
  const [pendingPickerValue, setPendingPickerValue] = useState(() =>
    range === "custom" && from && to
      ? `${from}--${to}`
      : presetToPickerValue(range),
  );

  // Re-sync picker state when loader data changes after navigation
  useEffect(() => {
    setPendingRange(range);
    const val =
      range === "custom" && from && to
        ? `${from}--${to}`
        : presetToPickerValue(range);
    setPendingPickerValue(val);
    if (datePickerRef.current) datePickerRef.current.value = val;
  }, [range, from, to]);

  function handlePresetSelect(value) {
    setPendingRange(value);
    if (value !== "custom") {
      const val = presetToPickerValue(value);
      setPendingPickerValue(val);
      if (datePickerRef.current) datePickerRef.current.value = val;
    }
  }

  function handleDatePickerChange(e) {
    setPendingPickerValue(e.target.value);
    setPendingRange("custom");
  }

  function handleApply() {
    if (pendingRange === "custom" && pendingPickerValue) {
      const [f, t] = pendingPickerValue.split("--");
      if (f && t) {
        navigate(`?from=${f}&to=${t}`);
        modalRef.current?.hideOverlay?.();
        return;
      }
    }
    navigate(`?range=${pendingRange}`);
    modalRef.current?.hideOverlay?.();
  }

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
      <s-section heading={rangeLabel}>
        <s-stack gap="base">
          <s-button command="--show" commandFor="date-range-modal" icon="calendar">
            {rangeLabel}
          </s-button>

          <s-modal ref={modalRef} id="date-range-modal" heading="Date range">
            <s-grid gridTemplateColumns="200px 1fr" gap="base">
              <s-stack gap="none">
                {DATE_RANGES.map((r) => (
                  <s-clickable
                    key={r.value}
                    padding="base"
                    background={pendingRange === r.value ? "subdued" : undefined}
                    borderRadius="base"
                    onClick={() => handlePresetSelect(r.value)}
                  >
                    <s-text type={pendingRange === r.value ? "strong" : undefined}>
                      {r.label}
                    </s-text>
                  </s-clickable>
                ))}
              </s-stack>
              <s-date-picker
                ref={datePickerRef}
                type="range"
                onChange={handleDatePickerChange}
              />
            </s-grid>

            <s-button slot="primary-action" variant="primary" onClick={handleApply}>
              Apply
            </s-button>
            <s-button
              slot="secondary-actions"
              command="--hide"
              commandFor="date-range-modal"
            >
              Cancel
            </s-button>
          </s-modal>

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
          <s-text color="subdued">
            No survey responses for {rangeLabel.toLowerCase()}.
          </s-text>
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
