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

const LAMATIC_API_URL = process.env.LAMATIC_API_URL;
const LAMATIC_API_KEY = process.env.LAMATIC_API_KEY;
const LAMATIC_PROJECT_ID = process.env.LAMATIC_PROJECT_ID;

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
