import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useState} from "preact/hooks";

const DEFAULT_ATTRIBUTION_OPTIONS = [
  "YouTube",
  "Instagram",
  "Garage Grown Gear",
  "TikTok",
  "Facebook",
  "From a Friend",
  "Physical Store",
  "Google Search",
  "Reddit",
  "Podcast",
  "Email / Newsletter",
  "Blog / Gear Review",
  "Event / Expo",
  "Other",
];

export default async function extension() {
  render(<AttributionSurvey />, document.body);
}

function AttributionSurvey() {
  const [surveyAttributionName, setSurveyAttributionName] = useState("");
  const [surveyAttributionDetails, setSurveyAttributionDetails] = useState("");
  const [attributionOptions, setAttributionOptions] = useState(
    DEFAULT_ATTRIBUTION_OPTIONS,
  );
  const [status, setStatus] = useState("idle");

  const orderConfirmation = shopify?.orderConfirmation?.value;
  const orderId = formatOrderId(orderConfirmation?.order?.id);
  const orderName = orderConfirmation?.number || "";
  const shopDomain = shopify?.shop?.myshopifyDomain || "";
  const endpoint = shopDomain
    ? `https://${shopDomain}/apps/attribution-survey`
    : "";
  const hasAttributionSelection = Boolean(surveyAttributionName);

  useEffect(() => {
    if (!endpoint) return;

    let ignoreResponse = false;

    async function loadAttributionOptions() {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) return;

        const data = await response.json();
        const options = Array.isArray(data.options)
          ? data.options.filter((option) => typeof option === "string" && option)
          : [];

        if (!ignoreResponse && options.length) {
          setAttributionOptions(options);
        }
      } catch (error) {
        console.error(error);
      }
    }

    loadAttributionOptions();

    return () => {
      ignoreResponse = true;
    };
  }, [endpoint]);

  function handleAttributionSelect(value) {
    setSurveyAttributionName(value);
  }

  async function submitSurvey() {
    if (!surveyAttributionName || !orderId || !endpoint) return;

    setStatus("submitting");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          shop: shopDomain,
          orderId,
          orderName,
          surveyAttributionName,
          surveyAttributionDetails,
          submittedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) throw new Error("Survey submission failed");

      setStatus("success");
    } catch (error) {
      console.error(error);
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <s-stack gap="base">
        <s-heading>Thanks!</s-heading>
        <s-text>This helps us know where people are finding Bowl & Kettle.</s-text>
      </s-stack>
    );
  }

  return (
    <s-stack gap="base">
      <s-heading>How did you hear about us?</s-heading>
      <s-text color="subdued">Select one</s-text>

      <s-stack
        direction="inline"
        gap="small-200"
        rowGap="small-200"
        accessibilityRole="unordered-list"
      >
        {attributionOptions.map((option) => (
          <AttributionOption
            key={option}
            label={option}
            selected={surveyAttributionName === option}
            subdued={hasAttributionSelection && surveyAttributionName !== option}
            onSelect={() => handleAttributionSelect(option)}
          />
        ))}
      </s-stack>

      {hasAttributionSelection && (
        <s-text-area
          label="Please provide additional details, such as the specific channel, account, or person you heard about us from."
          value={surveyAttributionDetails}
          maxLength={250}
          onInput={(event) => setSurveyAttributionDetails(event.target.value)}
        />
      )}

      {status === "error" && (
        <s-banner tone="critical">
          Sorry, something went wrong. Please try again.
        </s-banner>
      )}

      {!orderId && (
        <s-banner tone="critical">
          Order information is still loading.
        </s-banner>
      )}

      <s-button
        variant="primary"
        disabled={
          !surveyAttributionName ||
          !orderId ||
          !endpoint ||
          status === "submitting"
        }
        onClick={submitSurvey}
      >
        {status === "submitting" ? "Submitting..." : "Submit"}
      </s-button>
    </s-stack>
  );
}

function AttributionOption({label, selected, subdued, onSelect}) {
  return (
    <s-clickable
      accessibilityLabel={`${label}${selected ? ", selected" : ""}`}
      background={selected ? "base" : subdued ? "subdued" : "transparent"}
      border={selected ? "large base solid" : "base base solid"}
      borderRadius="max"
      paddingBlock="small-100"
      paddingInline="base"
      type="button"
      onClick={onSelect}
    >
      <s-text
        type={selected ? "strong" : "generic"}
        color={subdued ? "subdued" : "base"}
      >
        {label}
      </s-text>
    </s-clickable>
  );
}

function formatOrderId(orderId) {
  if (!orderId) return "";

  return orderId.replace(
    /^gid:\/\/shopify\/(?:OrderIdentity|Order)\//,
    "gid://shopify/Order/",
  );
}
