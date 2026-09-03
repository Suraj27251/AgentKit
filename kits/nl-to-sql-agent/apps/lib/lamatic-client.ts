import config from "../../lamatic.config";

if (!process.env.LAMATIC_API_URL) {
  throw new Error(
    "LAMATIC_API_URL is not set. Please add it to your .env.local file."
  );
}
if (!process.env.LAMATIC_PROJECT_ID) {
  throw new Error(
    "LAMATIC_PROJECT_ID is not set. Please add it to your .env.local file."
  );
}
if (!process.env.LAMATIC_API_KEY) {
  throw new Error(
    "LAMATIC_API_KEY is not set. Please add it to your .env.local file."
  );
}

const sqlFlowEnvKey = config.steps[0].envKey;

const nlToSqlFlowId = process.env[sqlFlowEnvKey];
if (!nlToSqlFlowId) {
  throw new Error(
    `${sqlFlowEnvKey} is not set. Please add it to your .env.local file.`
  );
}

export const NL_TO_SQL_FLOW_ID = nlToSqlFlowId;

const LAMATIC_API_KEY = process.env.LAMATIC_API_KEY;
const LAMATIC_PROJECT_ID = process.env.LAMATIC_PROJECT_ID;

/**
 * Require that the Lamatic endpoint is HTTPS. The Lamatic API credential (the
 * Authorization Bearer header derived from LAMATIC_API_KEY) must only ever be
 * transmitted over a secure, authenticated transport. Any plain-HTTP endpoint
 * - including localhost and loopback - is rejected before a request can be
 * constructed, so the key can never be sent in cleartext.
 *
 * Returns the validated URL so that the module's only fetch target is the
 * direct output of this validation.
 */
function validateLamaticEndpoint(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      "Invalid LAMATIC_API_URL. Please set a valid https:// Lamatic API URL."
    );
  }

  if (parsed.protocol !== "https:") {
    throw new Error(
      "Insecure LAMATIC_API_URL. Lamatic API credentials may only be transmitted over https://. Plain http:// endpoints, including localhost, are not allowed."
    );
  }

  return url;
}

// The only endpoint this module may send credentials to. Validation runs at
// module load (before any fetch) and LAMATIC_API_URL is defined as the return
// value of that validation, so the Authorization header can never be attached
// to an HTTP or otherwise unvalidated URL.
const LAMATIC_API_URL = validateLamaticEndpoint(process.env.LAMATIC_API_URL);

export async function executeLamaticFlow(
  flowId: string,
  payload: Record<string, unknown>
): Promise<{ status: string; result: any; message?: string }> {
  const query = `
    query ExecuteWorkflow(
      $workflowId: String!
      $question: String
    ) {
      executeWorkflow(
        workflowId: $workflowId
        payload: {
          question: $question
        }
      ) {
        status
        result
      }
    }
  `;

  const variables = {
    workflowId: flowId,
    ...payload,
  };

  const response = await fetch(LAMATIC_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LAMATIC_API_KEY}`,
      "Content-Type": "application/json",
      "x-project-id": LAMATIC_PROJECT_ID,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lamatic API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (data.errors && data.errors.length > 0) {
    throw new Error(`GraphQL error: ${data.errors[0].message}`);
  }

  const executeWorkflow = data.data?.executeWorkflow;
  if (!executeWorkflow) {
    throw new Error("No data returned from Lamatic workflow");
  }

  return {
    status: executeWorkflow.status,
    result: executeWorkflow.result,
  };
}
