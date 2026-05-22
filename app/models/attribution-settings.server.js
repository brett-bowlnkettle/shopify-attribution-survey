export const DEFAULT_ATTRIBUTION_OPTIONS = [
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

const SETTINGS_NAMESPACE = "attribution_survey";
const SETTINGS_KEY = "options";

export function normalizeAttributionOptions(value) {
  const lines = Array.isArray(value) ? value : String(value || "").split("\n");
  const seen = new Set();

  return lines
    .map((option) => option.trim())
    .filter(Boolean)
    .filter((option) => {
      const key = option.toLowerCase();
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}

export async function getAttributionOptions(admin) {
  if (!admin) return DEFAULT_ATTRIBUTION_OPTIONS;

  try {
    const response = await admin.graphql(
      `#graphql
      query AttributionSurveySettings {
        currentAppInstallation {
          metafield(namespace: "${SETTINGS_NAMESPACE}", key: "${SETTINGS_KEY}") {
            value
          }
        }
      }`,
    );
    const json = await response.json();
    const optionsJson = json.data?.currentAppInstallation?.metafield?.value;

    if (!optionsJson) return DEFAULT_ATTRIBUTION_OPTIONS;

    const options = normalizeAttributionOptions(JSON.parse(optionsJson));
    return options.length ? options : DEFAULT_ATTRIBUTION_OPTIONS;
  } catch (error) {
    console.error("Failed to load attribution options:", error);
    return DEFAULT_ATTRIBUTION_OPTIONS;
  }
}

export async function saveAttributionOptions(admin, value) {
  const options = normalizeAttributionOptions(value);
  const optionsToSave = options.length ? options : DEFAULT_ATTRIBUTION_OPTIONS;

  const installationResponse = await admin.graphql(
    `#graphql
    query AttributionSurveyInstallation {
      currentAppInstallation {
        id
      }
    }`,
  );
  const installationJson = await installationResponse.json();
  const ownerId = installationJson.data?.currentAppInstallation?.id;

  if (!ownerId) {
    throw new Error("Unable to find current app installation");
  }

  const response = await admin.graphql(
    `#graphql
    mutation SaveAttributionSurveySettings($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId,
            namespace: SETTINGS_NAMESPACE,
            key: SETTINGS_KEY,
            type: "json",
            value: JSON.stringify(optionsToSave),
          },
        ],
      },
    },
  );
  const json = await response.json();
  const errors = json.data?.metafieldsSet?.userErrors ?? [];

  if (errors.length) {
    throw new Error(errors[0].message);
  }

  return optionsToSave;
}
