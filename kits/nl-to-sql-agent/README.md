# Queryline — Natural Language to SQL for Microsoft SQL Server

Turn plain-English questions into safe, read-only SQL queries against a Microsoft SQL Server database, with automatic safety validation and a plain-language explanation of what the query does.

---

## Overview

Queryline is a Kit built on the [Lamatic AgentKit](https://lamatic.ai) platform. It combines a Lamatic flow with a Next.js web application so that people can ask questions about a SQL Server database without needing to write SQL by hand.

Anyone who wants answers from a database — analysts, operations teams, or business users — can type a question in natural language and receive:

- A generated SQL `SELECT` query
- A safety-checked result (write operations are rejected)
- Query results from the database when the query is deemed safe
- A plain-language explanation of what the query does

Natural-language database querying removes the barrier of having to know SQL syntax, table structure, and query conventions just to retrieve information.

---

## Problem

Databases hold valuable information, but the people who need that information are often not the people who can write SQL. A business user might want to know "how many customers signed up last month" or "which products had the most returns" — questions that require writing correct, efficient SQL and knowing the database schema.

In practice this creates a bottleneck: someone with SQL expertise must translate every question into a query, or the business user must learn SQL themselves. This is slow, repetitive, and error-prone.

Queryline reduces the need to write SQL manually by letting users ask their question in plain English. The agent generates a SQL query, validates it for safety, runs it against a read-only Microsoft SQL Server database, and explains the result back to the user.

---

## What It Does

Queryline implements a single flow (`flows/nl-to-sql-flow.ts`) that processes a user question end to end:

```
User question
  → Generate SQL (LLM node)
  → Validate SQL safety (code node)
  → Safety decision (condition node)
  → Execute on Microsoft SQL Server (mssql node) [only if safe]
  → Explain the SQL (LLM node)
  → Aggregate the response (code node)
  → Return the response to the application (API Response node)
```

Concretely, the flow:

1. **API Request** (trigger) — receives the user's question.
2. **Generate SQL** (LLM node) — converts the question into a single T-SQL `SELECT` statement, grounded in the provided database schema.
3. **Validate SQL** (code node) — checks the generated SQL for safety: it must start with `SELECT`, must not contain multiple statements, and must not contain write/DDL keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `MERGE`, `CALL`). If no `TOP` clause is present, it appends `TOP 1000` to bound the result size.
4. **Is SQL safe?** (condition node) — routes based on the validation result:
   - **Safe** → execute the query via the Microsoft SQL Server node.
   - **Unsafe** → skip execution and return the validation error.
5. **Explain SQL** (LLM node) — generates a plain-language explanation of what the query does.
6. **Aggregate Response** (code node) — combines the SQL, explanation, safety flag, query results, row count, and any error into a single structured response.
7. **API Response** — returns the structured result to the Next.js application.

---

## Key Features

All features below are verified against the current implementation.

- **Natural-language SQL generation** — an LLM node converts plain-English questions into SQL `SELECT` queries for Microsoft SQL Server (T-SQL).
- **Microsoft SQL Server support** — query execution uses a dedicated Microsoft SQL Server node (`mssqlNode`), including `TOP` support for row limiting.
- **SQL safety validation** — a code node rejects anything that is not a single read-only `SELECT`, blocking write and DDL keywords and multiple statements.
- **Read-only query behavior** — the flow is designed for `SELECT`-only queries; non-`SELECT` input is flagged as unsafe and not executed.
- **Result-size enforcement** — a `TOP 1000` clause is added when the query has no `TOP`, bounding returned rows.
- **Query execution** — safe queries are executed against the configured Microsoft SQL Server connection.
- **Result formatting** — results are aggregated into a structured response with the SQL, explanation, safety flag, rows, and row count.
- **Explanation of generated SQL** — an LLM node produces a plain-language explanation of what the query does.
- **Web interface** — a Next.js application provides a chat-style ask-and-answer interface with the results shown in a table.
- **Lamatic flow integration** — the application invokes the deployed Lamatic flow with the user's question and renders the returned data.

---

## Architecture

```
User
  ↓  (asks a question in natural language)
Next.js Application
  ↓  (invokes the deployed Lamatic flow)
Lamatic AgentKit Flow
  ↓
SQL Generation (LLM)
  ↓
SQL Validation (code node)
  ↓
Safety Decision (condition node)
  ↓  (safe branch only)
Microsoft SQL Server (mssql node)
  ↓
Explanation (LLM) + Result processing (code node)
  ↓
Next.js Application
  ↓
User
```

Components:

- **Next.js application** — `apps/` contains the runnable web app that captures the user's question, calls the Lamatic flow, and displays the SQL, explanation, and results.
- **Lamatic AgentKit** — hosts the flow, externalized prompts, scripts, model configs, and the constitution that drives the pipeline.
- **Microsoft SQL Server** — the database queried by the flow's `mssqlNode`.
- **Active flow** — `flows/nl-to-sql-flow.ts`, deployed to Lamatic as the active flow.

---

## Lamatic Flow

- **Flow file:** `flows/nl-to-sql-flow.ts`
- **Active Lamatic Flow ID:** `0b890b4d-dd30-4f33-9663-4311c896e1b5`

The flow orchestrates the full NL-to-SQL pipeline: it converts a question into SQL, validates it for read-only safety, executes it against Microsoft SQL Server when safe, generates an explanation, aggregates the result, and returns it to the application. The flow's behavior is driven by externalized resources in `prompts/`, `scripts/`, and `model-configs/`, referenced via the `@reference` system.

---

## Requirements

- **Node.js** — required to run the Next.js application (`next dev` / `next build`). No engine is pinned in `apps/package.json`; the app uses Next.js `14.2.15` and React `18.3.1`. Use a currently supported Node.js LTS release.
- **npm** — the package manager used by the application.
- **Lamatic credentials/configuration**
  - A Lamatic account and project.
  - The deployed flow ID (`NL_TO_SQL_FLOW_ID`).
  - The Lamatic API URL, project ID, and API key (`LAMATIC_API_URL`, `LAMATIC_PROJECT_ID`, `LAMATIC_API_KEY`).
- **Microsoft SQL Server** — a database for the flow's `mssqlNode` to query. Connection details are configured in the flow (typically in Lamatic Studio credentials). A read-only user and restricted-privilege database are recommended, since Queryline is designed for read-only `SELECT` queries.

---

## Environment Variables

Copy `apps/.env.example` to `apps/.env.local` and fill in the values. **Never commit a real API key or credential.**

| Variable | Purpose | Example placeholder |
|----------|---------|---------------------|
| `LAMATIC_API_URL` | Base URL of the Lamatic API used to invoke the flow. | `https://api.lamatic.ai` |
| `LAMATIC_PROJECT_ID` | Your Lamatic project identifier. | `your_lamatic_project_id` |
| `LAMATIC_API_KEY` | Secret API key for authenticating to Lamatic. | `your_lamatic_api_key` |
| `NL_TO_SQL_FLOW_ID` | ID of the deployed Queryline flow. | `your_deployed_flow_id` |
| `SESSION_PASSWORD` | Password used by `iron-session` to sign the session cookie (must be at least 32 characters). | `a_complex_password_at_least_32_chars_long!!` |
| `DEMO_USERNAME` | Demo username for the development login. | `demo` |
| `DEMO_PASSWORD` | Demo password for the development login. | `demo` |
| `MSSQL_SERVER` | Host of the Microsoft SQL Server instance (used by the flow; not read by the Next.js app). | `your_azure_sql_server.database.windows.net` |
| `MSSQL_PORT` | Port for the SQL Server connection. | `1433` |
| `MSSQL_DATABASE` | Name of the database to query. | `your_azure_sql_database` |
| `MSSQL_USER` | SQL Server user for the connection. | `your_azure_sql_user` |

Note: `MSSQL_*` values configure the flow's Microsoft SQL Server node and are not read by the Next.js application (SQL Server credentials are typically stored in Lamatic Studio). The application also reads an optional `MOCK_LAMATIC` flag (`true` returns a canned response for local front-end testing without calling Lamatic); it is not required.

---

## Demo Database

> This project is currently configured to query a **demo database** from the telecommunications sector.

To try the agent without setting up your own Microsoft SQL Server, the bundled flow points at a demo dataset of **10,000 customer records across 15 columns**. The data is provided **for demonstration purposes only** — treat it as sample/placeholder data rather than real production information. Individual customer records are not published here, but the dataset supports questions across these areas:

- **Customers** — customer names and email addresses.
- **Subscription plans** — plan type (for example Basic, Standard, Premium, Enterprise) and channel the customer was acquired through.
- **Billing / monthly fees** — the recurring monthly fee per customer.
- **Customer status** — active, inactive, suspended, or churned status.
- **Payment methods** — how the customer pays (for example UPI, credit/debit card, net banking, auto debit).
- **Data usage** — measured in GB.
- **Support tickets** — number of support tickets a customer has raised.
- **Renewals** — subscription renewal dates.
- **Customer acquisition channels** — how each customer was acquired (for example organic, referral, partner, direct, Google Ads, social media, email).
- **Geographic info** — the customer's city and state.
- **Signup and login info** — signup date and last login date.

You can ask questions such as "How many customers are active?" or "Average data usage by plan" and Queryline will generate and run safe, read-only `SELECT` queries over this demo data. To query your own data instead, replace the flow's Microsoft SQL Server connection details with a database of your choice (see [Requirements](#requirements) and the environment variables above).

---

## Authentication & Production Notes

The current login uses static **demo credentials** (`DEMO_USERNAME` / `DEMO_PASSWORD`, defaulting to `demo` / `demo`) for local development only. The app verifies these in `apps/actions/login.ts` and stores the session via `iron-session` (`apps/lib/session.ts`, cookie signed with `SESSION_PASSWORD`). This is fine for trying the app locally, but **do not deploy it as-is** — a shared, predictable username/password is not a production-grade gate.

For production, replace the demo login with an **OTP-based authentication flow built in Lamatic**. This keeps authentication logic alongside the rest of the pipeline in Lamatic Studio and removes static credentials from the app. The design below uses only nodes that already exist in Lamatic.

### Recommended OTP flow

Build a second flow (e.g. `flows/otp-auth-flow.ts`) with an **API Request** trigger that handles two operations:

**1. Send a verification code**

- Accept `email` as input.
- A **Code node** generates a short-lived, numeric one-time code (for example a 6-digit value with an expiry timestamp).
- A **Gmail node** (`gmailNode`, action `GMAIL_SEND_EMAIL`) emails the code to the address. The Gmail connection is created once under **Connections** in the project; credentials are stored by Lamatic via Google OAuth and never appear in the flow.
- Return a success/`ok` flag to the app (never echo the code back to the client).

**2. Verify the code**

- Accept `email` and `code` as input.
- A **Condition node** compares the submitted `code` to the generated code (optionally rolling/expiring it after the first successful check).
- On success the flow returns `{ authenticated: true }`; otherwise `{ authenticated: false }`.

Protect the verification against replay and abuse:

- Store the expected code (and its expiry) in Lamatic **Variables & Secrets** (Settings → Secrets) rather than hardcoding it in the flow.
- Shorten the code lifetime and invalidate it on first use.
- Rate-limit the send operation (for example via the flow's jobs/scheduling or a throttling code node) so codes can't be spammed.

### Wiring it into the app

- Deploy the OTP flow in Lamatic Studio and copy its **Flow ID**.
- Add an environment variable for it in `apps/.env.local` (and to `apps/.env.example`), e.g. `OTP_FLOW_ID` (style it `UPPER_SNAKE_CASE` to match the existing vars).
- In the app, replace the static check in `apps/actions/login.ts` with a call to Lamatic that invokes `OTP_FLOW_ID` — reusing the same pattern the app already uses to call `NL_TO_SQL_FLOW_ID`. The flow's response determines whether a session is created.
- Keep `DEMO_USERNAME` / `DEMO_PASSWORD` available *only* for local development; gate or remove them in production builds.

> Never put real API keys or OTP secrets in the README or commit them to the repository. Use the Lamatic Variables & Secrets store and environment variables, and treat the session cookie (`SESSION_PASSWORD`) as a secret.

---

## Local Development

```bash
cd kits/nl-to-sql-agent/apps
npm install
```

Create a `.env.local` file based on `apps/.env.example` and set your Lamatic credentials and the deployed flow ID.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or the port Next.js reports) and sign in with the demo credentials (`demo` / `demo`). Type a question such as "Show me all users" and submit — Queryline invokes the Lamatic flow and shows the generated SQL, explanation, and (if safe) the query results.

Useful scripts (from `apps/package.json`):

- `npm run dev` — start the Next.js development server.
- `npm run build` — create an optimized production build.
- `npm run start` — serve the production build.
- `npm run lint` — run ESLint.
