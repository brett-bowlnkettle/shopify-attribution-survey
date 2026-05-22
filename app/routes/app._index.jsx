import {useEffect, useState} from "react";
import {useFetcher, useLoaderData} from "react-router";
import {useAppBridge} from "@shopify/app-bridge-react";
import {boundary} from "@shopify/shopify-app-react-router/server";
import {authenticate} from "../shopify.server";
import {
  DEFAULT_ATTRIBUTION_OPTIONS,
  getAttributionOptions,
  saveAttributionOptions,
} from "../models/attribution-settings.server";

export const loader = async ({request}) => {
  const {admin} = await authenticate.admin(request);
  const options = await getAttributionOptions(admin);

  return {options};
};

export const action = async ({request}) => {
  const {admin} = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const value =
    intent === "reset"
      ? DEFAULT_ATTRIBUTION_OPTIONS
      : formData.get("options")?.toString() || "";
  const options = await saveAttributionOptions(admin, value);

  return {options};
};

export default function Index() {
  const {options} = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [optionsText, setOptionsText] = useState(options.join("\n"));
  const savedOptions = fetcher.data?.options || options;
  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.options) {
      setOptionsText(fetcher.data.options.join("\n"));
      shopify.toast.show("Attribution options saved");
    }
  }, [fetcher.data?.options, shopify]);

  function saveOptions() {
    fetcher.submit({options: optionsText}, {method: "POST"});
  }

  function resetOptions() {
    fetcher.submit({intent: "reset"}, {method: "POST"});
  }

  return (
    <s-page heading="Attribution Survey">
      <s-button
        slot="primary-action"
        variant="primary"
        loading={isSaving ? true : undefined}
        onClick={saveOptions}
      >
        Save
      </s-button>

      <s-section heading="Attribution options">
        <s-stack gap="base">
          <s-text-area
            label="Options"
            rows={12}
            value={optionsText}
            onInput={(event) => setOptionsText(event.currentTarget.value)}
          />

          <s-stack direction="inline" gap="base">
            <s-button
              variant="primary"
              loading={isSaving ? true : undefined}
              onClick={saveOptions}
            >
              Save
            </s-button>
            <s-button
              variant="secondary"
              disabled={isSaving}
              onClick={resetOptions}
            >
              Reset defaults
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Current options">
        <s-unordered-list>
          {savedOptions.map((option) => (
            <s-list-item key={option}>{option}</s-list-item>
          ))}
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
