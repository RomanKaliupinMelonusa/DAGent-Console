#!/usr/bin/env npx tsx
/**
 * Synthetic test fixture generator — creates realistic pipeline data
 * matching the DAGent data contracts in both in-progress/ and archive/features/.
 *
 * Usage:
 *   npx tsx scripts/generate-fixtures.ts [output-dir]
 *
 * Default output: ./fixtures/sample-app
 */

import path from "path";
import { mkdirSync, writeFileSync } from "fs";

const OUTPUT_DIR = process.argv[2] || path.join(__dirname, "..", "fixtures", "sample-app");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string) {
    mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, data: unknown) {
    writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function writeText(filePath: string, content: string) {
    writeFileSync(filePath, content);
}

const NOW = new Date();
function ago(minutes: number): string {
    return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// 1. Active pipeline: "test-feature" in in-progress/
// ---------------------------------------------------------------------------

const activeSlug = "test-feature";
const inProgressDir = path.join(OUTPUT_DIR, "in-progress");
ensureDir(inProgressDir);

// -- _STATE.json --
const activeState = {
    feature: "test-feature",
    workflowType: "fullstack",
    started: ago(45),
    deployedUrl: null,
    implementationNotes: null,
    items: [
        { key: "schema-dev", label: "Schema Dev", agent: "@schema-dev", phase: "pre-deploy", status: "done", error: null },
        { key: "backend-dev", label: "Backend Dev", agent: "@backend-dev", phase: "pre-deploy", status: "done", error: null, docNote: "Added REST endpoints for /api/users" },
        { key: "frontend-dev", label: "Frontend Dev", agent: "@frontend-dev", phase: "pre-deploy", status: "done", error: null },
        { key: "backend-unit-test", label: "Backend Unit Test", agent: "@backend-test", phase: "pre-deploy", status: "done", error: null },
        { key: "frontend-unit-test", label: "Frontend Unit Test", agent: "@frontend-ui-test", phase: "pre-deploy", status: "done", error: null },
        { key: "code-cleanup", label: "Code Cleanup", agent: "@dev-expert", phase: "pre-deploy", status: "pending", error: null },
        { key: "push-infra", label: "Push Infra", agent: "@deploy-manager", phase: "deploy", status: "pending", error: null },
        { key: "poll-infra-plan", label: "Poll Infra Plan", agent: "@deploy-manager", phase: "deploy", status: "pending", error: null },
        { key: "create-draft-pr", label: "Create Draft PR", agent: "@deploy-manager", phase: "deploy", status: "pending", error: null },
        { key: "push-app", label: "Push App", agent: "@deploy-manager", phase: "deploy", status: "pending", error: null },
        { key: "poll-app-ci", label: "Poll App CI", agent: "@deploy-manager", phase: "deploy", status: "pending", error: null },
        { key: "integration-test", label: "Integration Test", agent: "@backend-test", phase: "post-deploy", status: "pending", error: null },
        { key: "live-ui", label: "Live UI", agent: "@frontend-ui-test", phase: "post-deploy", status: "pending", error: null },
        { key: "docs-archived", label: "Docs Archived", agent: "@docs-agent", phase: "finalize", status: "pending", error: null },
        { key: "create-pr", label: "Create PR", agent: "@deploy-manager", phase: "finalize", status: "pending", error: null },
    ],
    errorLog: [],
};
writeJson(path.join(inProgressDir, `${activeSlug}_STATE.json`), activeState);

// -- _FLIGHT_DATA.json (envelope format) --
const activeFlightData = {
    version: 1,
    generatedAt: ago(0.5),
    featureSlug: activeSlug,
    items: [
        {
            key: "schema-dev",
            label: "Schema Dev",
            agent: "@schema-dev",
            phase: "pre-deploy",
            attempt: 1,
            startedAt: ago(45),
            finishedAt: ago(40),
            durationMs: 300000,
            outcome: "completed",
            intents: ["Read existing schemas", "Generate Zod schemas for user model"],
            messages: ["Schema generation complete"],
            filesRead: ["packages/schemas/src/index.ts"],
            filesChanged: ["packages/schemas/src/user.ts"],
            shellCommands: [
                { command: "cat packages/schemas/src/index.ts", timestamp: ago(44), isPipelineOp: false },
            ],
            toolCounts: { "file-read": 5, "file-write": 2, "shell": 1, "intent": 2 },
            inputTokens: 12000,
            outputTokens: 3500,
            cacheReadTokens: 8000,
            cacheWriteTokens: 2000,
            headAfterAttempt: "abc1234",
        },
        {
            key: "backend-dev",
            label: "Backend Dev",
            agent: "@backend-dev",
            phase: "pre-deploy",
            attempt: 1,
            startedAt: ago(38),
            finishedAt: ago(28),
            durationMs: 600000,
            outcome: "completed",
            intents: ["Implement user CRUD endpoints", "Add auth middleware"],
            messages: ["Backend implementation complete"],
            filesRead: ["backend/src/routes/index.ts", "backend/src/middleware/auth.ts"],
            filesChanged: ["backend/src/routes/users.ts", "backend/src/middleware/auth.ts"],
            shellCommands: [
                { command: "npm test -- --passWithNoTests", timestamp: ago(30), isPipelineOp: false },
            ],
            toolCounts: { "file-read": 12, "file-write": 6, "file-edit": 3, "shell": 2, "search": 4, "intent": 2 },
            inputTokens: 45000,
            outputTokens: 12000,
            cacheReadTokens: 30000,
            cacheWriteTokens: 8000,
            headAfterAttempt: "def5678",
        },
        {
            key: "frontend-dev",
            label: "Frontend Dev",
            agent: "@frontend-dev",
            phase: "pre-deploy",
            attempt: 1,
            startedAt: ago(38),
            finishedAt: ago(25),
            durationMs: 780000,
            outcome: "completed",
            intents: ["Create user list page", "Add form validation"],
            messages: ["Frontend implementation complete"],
            filesRead: ["frontend/src/pages/index.tsx"],
            filesChanged: ["frontend/src/pages/users.tsx", "frontend/src/components/UserForm.tsx"],
            shellCommands: [],
            toolCounts: { "file-read": 8, "file-write": 4, "file-edit": 5, "search": 2, "intent": 2 },
            inputTokens: 38000,
            outputTokens: 9500,
            cacheReadTokens: 22000,
            cacheWriteTokens: 6000,
            headAfterAttempt: "ghi9012",
        },
        {
            key: "backend-unit-test",
            label: "Backend Unit Test",
            agent: "@backend-test",
            phase: "pre-deploy",
            attempt: 1,
            startedAt: ago(25),
            finishedAt: ago(20),
            durationMs: 300000,
            outcome: "failed",
            intents: ["Run backend unit tests"],
            messages: ["Tests failed — 2 assertions broken"],
            filesRead: ["backend/src/routes/users.ts"],
            filesChanged: [],
            shellCommands: [
                { command: "npm test", timestamp: ago(24), isPipelineOp: false },
            ],
            toolCounts: { "file-read": 3, "shell": 2, "intent": 1 },
            inputTokens: 8000,
            outputTokens: 2000,
            cacheReadTokens: 5000,
            cacheWriteTokens: 1000,
            errorMessage: JSON.stringify({
                fault_domain: "backend",
                diagnostic_trace: "2 tests failed: UserController.create expects 201 status, got 200. UserController.delete expects soft-delete, got hard-delete."
            }),
        },
        {
            key: "backend-unit-test",
            label: "Backend Unit Test",
            agent: "@backend-test",
            phase: "pre-deploy",
            attempt: 2,
            startedAt: ago(19),
            finishedAt: ago(15),
            durationMs: 240000,
            outcome: "completed",
            intents: ["Fix broken assertions and re-run"],
            messages: ["All 14 tests passing"],
            filesRead: ["backend/src/routes/users.ts"],
            filesChanged: ["backend/src/routes/users.ts"],
            shellCommands: [
                { command: "npm test", timestamp: ago(16), isPipelineOp: false },
            ],
            toolCounts: { "file-read": 4, "file-edit": 2, "shell": 2, "intent": 1 },
            inputTokens: 10000,
            outputTokens: 3000,
            cacheReadTokens: 7000,
            cacheWriteTokens: 1500,
            headAfterAttempt: "jkl3456",
        },
        {
            key: "frontend-unit-test",
            label: "Frontend Unit Test",
            agent: "@frontend-ui-test",
            phase: "pre-deploy",
            attempt: 1,
            startedAt: ago(25),
            finishedAt: ago(18),
            durationMs: 420000,
            outcome: "completed",
            intents: ["Run frontend unit tests"],
            messages: ["All 8 tests passing"],
            filesRead: ["frontend/src/pages/users.tsx"],
            filesChanged: [],
            shellCommands: [
                { command: "npx jest --passWithNoTests", timestamp: ago(20), isPipelineOp: false },
            ],
            toolCounts: { "file-read": 6, "shell": 3, "intent": 1 },
            inputTokens: 9000,
            outputTokens: 2500,
            cacheReadTokens: 6000,
            cacheWriteTokens: 1200,
            headAfterAttempt: "mno7890",
        },
        // Currently in-progress step
        {
            key: "code-cleanup",
            label: "Code Cleanup",
            agent: "@dev-expert",
            phase: "pre-deploy",
            attempt: 1,
            startedAt: ago(5),
            finishedAt: ago(5), // equals startedAt while in-progress
            durationMs: 0,
            outcome: "in-progress",
            intents: ["Remove dead imports", "Standardize error handling"],
            messages: [],
            filesRead: ["backend/src/routes/users.ts", "frontend/src/pages/users.tsx"],
            filesChanged: ["backend/src/routes/users.ts"],
            shellCommands: [
                { command: "npx eslint backend/src --fix", timestamp: ago(3), isPipelineOp: false },
            ],
            toolCounts: { "file-read": 14, "file-edit": 6, "shell": 3, "search": 2, "intent": 2 },
            inputTokens: 18000,
            outputTokens: 5500,
            cacheReadTokens: 12000,
            cacheWriteTokens: 3000,
        },
    ],
};
writeJson(path.join(inProgressDir, `${activeSlug}_FLIGHT_DATA.json`), activeFlightData);

// -- _CHANGES.json --
const activeChanges = {
    feature: activeSlug,
    stepsCompleted: [
        { key: "schema-dev", agent: "@schema-dev", filesChanged: ["packages/schemas/src/user.ts"], docNote: null },
        { key: "backend-dev", agent: "@backend-dev", filesChanged: ["backend/src/routes/users.ts", "backend/src/middleware/auth.ts"], docNote: "Added REST endpoints for /api/users" },
        { key: "frontend-dev", agent: "@frontend-dev", filesChanged: ["frontend/src/pages/users.tsx", "frontend/src/components/UserForm.tsx"], docNote: "Created user management UI with form validation" },
    ],
    allFilesChanged: [
        "packages/schemas/src/user.ts",
        "backend/src/routes/users.ts",
        "backend/src/middleware/auth.ts",
        "frontend/src/pages/users.tsx",
        "frontend/src/components/UserForm.tsx",
    ],
    summaryIntents: [
        "Read existing schemas",
        "Generate Zod schemas for user model",
        "Implement user CRUD endpoints",
        "Add auth middleware",
        "Create user list page",
        "Add form validation",
    ],
};
writeJson(path.join(inProgressDir, `${activeSlug}_CHANGES.json`), activeChanges);

// -- _SPEC.md --
writeText(path.join(inProgressDir, `${activeSlug}_SPEC.md`), `# Test Feature Spec

## Overview
Add user management functionality with CRUD endpoints and a frontend UI.

## Requirements
- REST API endpoints for users (GET, POST, PUT, DELETE)
- Frontend page listing all users
- Form for creating/editing users with validation
- Zod schemas shared between frontend and backend
`);

// -- _SUMMARY.md --
writeText(path.join(inProgressDir, `${activeSlug}_SUMMARY.md`), `# Pipeline Summary — test-feature

| Step | Agent | Status | Duration | Cost |
|------|-------|--------|----------|------|
| schema-dev | @schema-dev | done | 5m | $0.28 |
| backend-dev | @backend-dev | done | 10m | $1.52 |
| frontend-dev | @frontend-dev | done | 13m | $1.18 |
| backend-unit-test | @backend-test | done (retry) | 9m | $0.45 |
| frontend-unit-test | @frontend-ui-test | done | 7m | $0.32 |
| code-cleanup | @dev-expert | **in-progress** | — | — |
`);

// -- _TERMINAL-LOG.md --
writeText(path.join(inProgressDir, `${activeSlug}_TERMINAL-LOG.md`), `# Terminal Log — test-feature

## schema-dev
\`\`\`
$ cat packages/schemas/src/index.ts
\`\`\`

## backend-dev
\`\`\`
$ npm test -- --passWithNoTests
Tests: 14 passed, 14 total
\`\`\`
`);

// -- _TRANS.md --
writeText(path.join(inProgressDir, `${activeSlug}_TRANS.md`), `# Transition Log — test-feature

- ${ago(45)} — Pipeline started (fullstack workflow)
- ${ago(40)} — schema-dev → done
- ${ago(28)} — backend-dev → done
- ${ago(25)} — frontend-dev → done
- ${ago(15)} — backend-unit-test → done (attempt 2)
- ${ago(18)} — frontend-unit-test → done
- ${ago(5)} — code-cleanup → in-progress
`);

// -- README.md (always present) --
writeText(path.join(inProgressDir, "README.md"), "# In-Progress Pipelines\nThis directory is managed by the DAGent orchestrator.\n");

// ---------------------------------------------------------------------------
// 2. Archived pipeline: "old-feature" in archive/features/
// ---------------------------------------------------------------------------

const archivedSlug = "old-feature";
const archiveDir = path.join(OUTPUT_DIR, "archive", "features", archivedSlug);
ensureDir(archiveDir);

const archivedState = {
    feature: "old-feature",
    workflowType: "fullstack",
    started: ago(2880), // 2 days ago
    deployedUrl: "https://github.com/example/repo/pull/42",
    implementationNotes: "PR #42 created for merge to main",
    items: [
        { key: "schema-dev", label: "Schema Dev", agent: "@schema-dev", phase: "pre-deploy", status: "done", error: null },
        { key: "backend-dev", label: "Backend Dev", agent: "@backend-dev", phase: "pre-deploy", status: "done", error: null },
        { key: "frontend-dev", label: "Frontend Dev", agent: "@frontend-dev", phase: "pre-deploy", status: "done", error: null },
        { key: "backend-unit-test", label: "Backend Unit Test", agent: "@backend-test", phase: "pre-deploy", status: "done", error: null },
        { key: "frontend-unit-test", label: "Frontend Unit Test", agent: "@frontend-ui-test", phase: "pre-deploy", status: "done", error: null },
        { key: "code-cleanup", label: "Code Cleanup", agent: "@dev-expert", phase: "pre-deploy", status: "done", error: null },
        { key: "push-infra", label: "Push Infra", agent: "@deploy-manager", phase: "deploy", status: "na", error: null },
        { key: "poll-infra-plan", label: "Poll Infra Plan", agent: "@deploy-manager", phase: "deploy", status: "na", error: null },
        { key: "create-draft-pr", label: "Create Draft PR", agent: "@deploy-manager", phase: "deploy", status: "done", error: null },
        { key: "push-app", label: "Push App", agent: "@deploy-manager", phase: "deploy", status: "done", error: null },
        { key: "poll-app-ci", label: "Poll App CI", agent: "@deploy-manager", phase: "deploy", status: "done", error: null },
        { key: "integration-test", label: "Integration Test", agent: "@backend-test", phase: "post-deploy", status: "done", error: null },
        { key: "live-ui", label: "Live UI", agent: "@frontend-ui-test", phase: "post-deploy", status: "done", error: null },
        { key: "docs-archived", label: "Docs Archived", agent: "@docs-agent", phase: "finalize", status: "done", error: null },
        { key: "create-pr", label: "Create PR", agent: "@deploy-manager", phase: "finalize", status: "done", error: null },
    ],
    errorLog: [
        {
            timestamp: ago(2820),
            itemKey: "backend-unit-test",
            message: "Timeout after 60000ms — Jest hung on database connection teardown",
        },
    ],
};
writeJson(path.join(archiveDir, `${archivedSlug}_STATE.json`), archivedState);

const archivedFlightData = {
    version: 1,
    generatedAt: ago(2800),
    featureSlug: archivedSlug,
    items: [
        {
            key: "schema-dev", label: "Schema Dev", agent: "@schema-dev", phase: "pre-deploy",
            attempt: 1, startedAt: ago(2880), finishedAt: ago(2870), durationMs: 600000,
            outcome: "completed", intents: ["Analyze DB schema"], messages: ["Done"],
            filesRead: [], filesChanged: ["db/schema.sql"],
            shellCommands: [], toolCounts: { "file-read": 3, "file-write": 1 },
            inputTokens: 8000, outputTokens: 2000, cacheReadTokens: 5000, cacheWriteTokens: 1000,
            headAfterAttempt: "aaa1111",
        },
        {
            key: "backend-dev", label: "Backend Dev", agent: "@backend-dev", phase: "pre-deploy",
            attempt: 1, startedAt: ago(2870), finishedAt: ago(2850), durationMs: 1200000,
            outcome: "completed", intents: ["Build API layer"], messages: ["Done"],
            filesRead: [], filesChanged: ["backend/src/api.ts"],
            shellCommands: [], toolCounts: { "file-read": 15, "file-write": 8, "shell": 3 },
            inputTokens: 55000, outputTokens: 18000, cacheReadTokens: 35000, cacheWriteTokens: 10000,
            headAfterAttempt: "bbb2222",
        },
        {
            key: "frontend-dev", label: "Frontend Dev", agent: "@frontend-dev", phase: "pre-deploy",
            attempt: 1, startedAt: ago(2870), finishedAt: ago(2845), durationMs: 1500000,
            outcome: "completed", intents: ["Create dashboard"], messages: ["Done"],
            filesRead: [], filesChanged: ["frontend/src/App.tsx"],
            shellCommands: [], toolCounts: { "file-read": 10, "file-write": 5, "shell": 2 },
            inputTokens: 42000, outputTokens: 11000, cacheReadTokens: 28000, cacheWriteTokens: 7000,
            headAfterAttempt: "ccc3333",
        },
        {
            key: "backend-unit-test", label: "Backend Unit Test", agent: "@backend-test", phase: "pre-deploy",
            attempt: 1, startedAt: ago(2845), finishedAt: ago(2840), durationMs: 300000,
            outcome: "error", intents: ["Run tests"], messages: [],
            filesRead: [], filesChanged: [],
            shellCommands: [{ command: "npm test", timestamp: ago(2842), isPipelineOp: false }],
            toolCounts: { "shell": 2 },
            inputTokens: 5000, outputTokens: 1000, cacheReadTokens: 3000, cacheWriteTokens: 500,
            errorMessage: "Cognitive circuit breaker: Jest hung on database connection teardown after 60s",
        },
        {
            key: "backend-unit-test", label: "Backend Unit Test", agent: "@backend-test", phase: "pre-deploy",
            attempt: 2, startedAt: ago(2839), finishedAt: ago(2830), durationMs: 540000,
            outcome: "completed", intents: ["Fix teardown and retry"], messages: ["All tests pass"],
            filesRead: [], filesChanged: ["backend/jest.teardown.ts"],
            shellCommands: [{ command: "npm test", timestamp: ago(2832), isPipelineOp: false }],
            toolCounts: { "file-read": 3, "file-edit": 1, "shell": 2 },
            inputTokens: 12000, outputTokens: 3500, cacheReadTokens: 8000, cacheWriteTokens: 2000,
            headAfterAttempt: "ddd4444",
        },
        {
            key: "frontend-unit-test", label: "Frontend Unit Test", agent: "@frontend-ui-test", phase: "pre-deploy",
            attempt: 1, startedAt: ago(2845), finishedAt: ago(2835), durationMs: 600000,
            outcome: "completed", intents: ["Run frontend tests"], messages: ["12 tests pass"],
            filesRead: [], filesChanged: [],
            shellCommands: [], toolCounts: { "file-read": 4, "shell": 2 },
            inputTokens: 7000, outputTokens: 1800, cacheReadTokens: 4500, cacheWriteTokens: 900,
            headAfterAttempt: "eee5555",
        },
        {
            key: "code-cleanup", label: "Code Cleanup", agent: "@dev-expert", phase: "pre-deploy",
            attempt: 1, startedAt: ago(2830), finishedAt: ago(2825), durationMs: 300000,
            outcome: "completed", intents: ["Remove dead code"], messages: ["Done"],
            filesRead: [], filesChanged: ["backend/src/api.ts"],
            shellCommands: [], toolCounts: { "file-read": 6, "file-edit": 3 },
            inputTokens: 10000, outputTokens: 2500, cacheReadTokens: 7000, cacheWriteTokens: 1500,
            headAfterAttempt: "fff6666",
        },
        {
            key: "create-draft-pr", label: "Create Draft PR", agent: "@deploy-manager", phase: "deploy",
            attempt: 1, startedAt: ago(2825), finishedAt: ago(2823), durationMs: 120000,
            outcome: "completed", intents: ["Create GitHub PR"], messages: ["PR #42 created"],
            filesRead: [], filesChanged: [],
            shellCommands: [{ command: "gh pr create --draft", timestamp: ago(2824), isPipelineOp: true }],
            toolCounts: { "shell": 1 },
            inputTokens: 3000, outputTokens: 800, cacheReadTokens: 2000, cacheWriteTokens: 400,
        },
        {
            key: "push-app", label: "Push App", agent: "@deploy-manager", phase: "deploy",
            attempt: 1, startedAt: ago(2823), finishedAt: ago(2820), durationMs: 180000,
            outcome: "completed", intents: ["Push to origin"], messages: ["Pushed"],
            filesRead: [], filesChanged: [],
            shellCommands: [{ command: "git push origin feature/old-feature", timestamp: ago(2821), isPipelineOp: true }],
            toolCounts: { "shell": 2 },
            inputTokens: 2000, outputTokens: 500, cacheReadTokens: 1500, cacheWriteTokens: 300,
        },
        {
            key: "poll-app-ci", label: "Poll App CI", agent: "@deploy-manager", phase: "deploy",
            attempt: 1, startedAt: ago(2820), finishedAt: ago(2810), durationMs: 600000,
            outcome: "completed", intents: ["Wait for CI"], messages: ["CI green"],
            filesRead: [], filesChanged: [],
            shellCommands: [{ command: "gh run list --branch feature/old-feature", timestamp: ago(2815), isPipelineOp: false }],
            toolCounts: { "shell": 5 },
            inputTokens: 4000, outputTokens: 1000, cacheReadTokens: 2500, cacheWriteTokens: 500,
        },
        {
            key: "integration-test", label: "Integration Test", agent: "@backend-test", phase: "post-deploy",
            attempt: 1, startedAt: ago(2810), finishedAt: ago(2805), durationMs: 300000,
            outcome: "completed", intents: ["Run integration suite"], messages: ["All pass"],
            filesRead: [], filesChanged: [],
            shellCommands: [{ command: "npm run test:integration", timestamp: ago(2807), isPipelineOp: false }],
            toolCounts: { "shell": 2 },
            inputTokens: 6000, outputTokens: 1500, cacheReadTokens: 4000, cacheWriteTokens: 800,
        },
        {
            key: "live-ui", label: "Live UI", agent: "@frontend-ui-test", phase: "post-deploy",
            attempt: 1, startedAt: ago(2810), finishedAt: ago(2803), durationMs: 420000,
            outcome: "completed", intents: ["Run Playwright visual tests"], messages: ["6 screenshots captured"],
            filesRead: [], filesChanged: [],
            shellCommands: [{ command: "npx playwright test", timestamp: ago(2806), isPipelineOp: false }],
            toolCounts: { "shell": 3 },
            inputTokens: 8000, outputTokens: 2000, cacheReadTokens: 5000, cacheWriteTokens: 1000,
        },
        {
            key: "docs-archived", label: "Docs Archived", agent: "@docs-agent", phase: "finalize",
            attempt: 1, startedAt: ago(2803), finishedAt: ago(2801), durationMs: 120000,
            outcome: "completed", intents: ["Generate docs"], messages: ["Docs written"],
            filesRead: [], filesChanged: ["docs/old-feature.md"],
            shellCommands: [], toolCounts: { "file-read": 2, "file-write": 1 },
            inputTokens: 5000, outputTokens: 1500, cacheReadTokens: 3000, cacheWriteTokens: 600,
        },
        {
            key: "create-pr", label: "Create PR", agent: "@deploy-manager", phase: "finalize",
            attempt: 1, startedAt: ago(2801), finishedAt: ago(2800), durationMs: 60000,
            outcome: "completed", intents: ["Mark PR ready for review"], messages: ["PR ready"],
            filesRead: [], filesChanged: [],
            shellCommands: [{ command: "gh pr ready 42", timestamp: ago(2800), isPipelineOp: true }],
            toolCounts: { "shell": 1 },
            inputTokens: 2000, outputTokens: 500, cacheReadTokens: 1000, cacheWriteTokens: 200,
        },
    ],
};
writeJson(path.join(archiveDir, `${archivedSlug}_FLIGHT_DATA.json`), archivedFlightData);

const archivedChanges = {
    feature: archivedSlug,
    stepsCompleted: [
        { key: "schema-dev", agent: "@schema-dev", filesChanged: ["db/schema.sql"], docNote: null },
        { key: "backend-dev", agent: "@backend-dev", filesChanged: ["backend/src/api.ts"], docNote: "Built REST API with Express" },
        { key: "frontend-dev", agent: "@frontend-dev", filesChanged: ["frontend/src/App.tsx"], docNote: "Dashboard with React" },
        { key: "code-cleanup", agent: "@dev-expert", filesChanged: ["backend/src/api.ts"], docNote: "Removed unused imports" },
        { key: "docs-archived", agent: "@docs-agent", filesChanged: ["docs/old-feature.md"], docNote: null },
    ],
    allFilesChanged: ["db/schema.sql", "backend/src/api.ts", "frontend/src/App.tsx", "docs/old-feature.md", "backend/jest.teardown.ts"],
    summaryIntents: ["Analyze DB schema", "Build API layer", "Create dashboard", "Remove dead code"],
};
writeJson(path.join(archiveDir, `${archivedSlug}_CHANGES.json`), archivedChanges);

writeText(path.join(archiveDir, `${archivedSlug}_SPEC.md`), `# Old Feature Spec

Add a dashboard page with user analytics.
`);

writeText(path.join(archiveDir, `${archivedSlug}_SUMMARY.md`), `# Pipeline Summary — old-feature

All steps completed. PR #42 ready for review.
Total cost: $4.87
`);

writeText(path.join(archiveDir, `${archivedSlug}_TERMINAL-LOG.md`), `# Terminal Log — old-feature

## backend-unit-test (attempt 1)
\`\`\`
$ npm test
FAIL — Jest hung on teardown
\`\`\`

## backend-unit-test (attempt 2)
\`\`\`
$ npm test
Tests: 14 passed
\`\`\`
`);

writeText(path.join(archiveDir, `${archivedSlug}_TRANS.md`), `# Transition Log — old-feature

- Pipeline completed successfully
- backend-unit-test required 1 retry (circuit breaker triggered)
`);

// -- Screenshots directory --
const screenshotsDir = path.join(archiveDir, "screenshots");
ensureDir(screenshotsDir);
// Create a tiny placeholder PNG (1x1 pixel)
const TINY_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
);
writeFileSync(path.join(screenshotsDir, `${archivedSlug}-01-dashboard.png`), TINY_PNG);

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

console.log(`✅ Fixtures generated at: ${OUTPUT_DIR}`);
console.log(`   in-progress/${activeSlug}_* (active pipeline with in-progress step)`);
console.log(`   archive/features/${archivedSlug}/ (completed pipeline with retry + circuit breaker)`);
