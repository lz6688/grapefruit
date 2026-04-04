# Script Management Design

Date: 2026-04-04

## Summary

Add a first-class script management system to Grapefruit that lets users:

- create, edit, save, rename, and delete reusable scripts in the frontend;
- import and export single scripts as `.js` files;
- import and export the full script library as a `.json` file;
- combine multiple scripts into reusable injection plans;
- automatically inject matching plans into target processes;
- control injection timing per script item with `spawn` and `attach`.

The system will use server-side persistence backed by the existing Drizzle + SQLite storage layer. The current scratch pad remains available and gains a "save to script library" path instead of being replaced.

## Approved Product Decisions

- Persist scripts on the server, not in browser-only storage.
- Separate global script library from target-specific injection plans.
- Auto-apply matching plans on session connect.
- Support both app targets and daemon/process targets.
- Keep the current scratch pad and let it promote code into the script library.
- Importing the full script library appends new scripts instead of overwriting existing ones.
- Name collisions during library import are resolved by automatic renaming, not replacement.
- Injection plan platform labels should display `iOS` and `Android` in the GUI while preserving stored values `fruity` and `droid`.

## Goals

- Reuse scripts across browsers and sessions.
- Support backup and migration of reusable scripts.
- Support multi-script injection with explicit order.
- Support per-script timing selection: `spawn` or `attach`.
- Match plans against app sessions and daemon sessions.
- Keep the default session flow unchanged when no plan matches.
- Surface injection results clearly to users.

## Non-Goals

- Script version history.
- Collaborative editing or multi-user locking.
- Complex conditions beyond target matching in v1.
- Full audit/history storage of every injection run.
- Replacing the existing base agent loading flow.

## Current State

Today Grapefruit has a single scratch pad:

- frontend content is stored in `localStorage`;
- running code emits `eval` over the session socket;
- the server forwards to `script.evaluate`;
- the agent executes via `Script.evaluate(...)` inside the current session.

There is no script library, no target matching, no multi-script orchestration, and no injection timing control beyond the current session state.

## Proposed Architecture

Split the feature into three layers:

1. Script Library
   Stores reusable script source and metadata.

2. Injection Plans
   Store target matching rules plus an ordered set of script references.

3. Session Auto-Injection
   During session setup, resolve matching plans and execute their script items at the proper lifecycle stage.

Scripts answer "what code should run."
Plans answer "when and where should those scripts run."

## Data Model

Use the existing Drizzle schema and database in `env.workdir/data/data.db`.

### `scripts`

- `id` integer primary key
- `name` text not null
- `description` text nullable
- `source` text not null
- `createdAt` text default current timestamp
- `updatedAt` text default current timestamp

Constraints:

- `name` must be non-empty
- names are not unique; `id` is the canonical identity

### `script_plans`

- `id` integer primary key
- `name` text not null
- `enabled` integer not null default `1`
- `autoApply` integer not null default `1`
- `continueOnError` integer not null default `1`
- `priority` integer not null default `0`
- `createdAt` text default current timestamp
- `updatedAt` text default current timestamp

Purpose:

- top-level plan metadata
- execution priority when multiple plans match

### `script_plan_targets`

- `id` integer primary key
- `planId` integer not null
- `platform` text not null
- `mode` text not null
- `bundle` text nullable
- `processName` text nullable
- `pid` integer nullable

Rules:

- `mode=app` requires `bundle`
- `mode=daemon` requires `processName` or `pid`
- `platform` matches existing session platform values

Purpose:

- one plan can match multiple targets
- matching remains declarative and plan-scoped

### `script_plan_items`

- `id` integer primary key
- `planId` integer not null
- `scriptId` integer not null
- `position` integer not null
- `injectWhen` text not null
- `enabled` integer not null default `1`

Rules:

- `injectWhen` is `spawn` or `attach`
- `position` controls stable execution order

Purpose:

- references a script from the library
- stores per-plan ordering and timing

## Backend API

Expose CRUD endpoints in a dedicated routes module.

### Scripts

- `GET /api/scripts`
- `POST /api/scripts`
- `GET /api/scripts/:id`
- `PUT /api/scripts/:id`
- `DELETE /api/scripts/:id`
- `GET /api/scripts/export`
- `POST /api/scripts/import`

Response shape:

- list endpoints return lightweight metadata
- detail endpoints return full source

Validation:

- `name` required
- `source` required

Import/export:

- single-script `.js` import/export is handled in the frontend editor
- library export returns a JSON document with `version`, `exportedAt`, and `scripts`
- library import validates the full payload before writing anything
- library import appends scripts and resolves duplicate names by automatic renaming

### Injection Plans

- `GET /api/script-plans`
- `POST /api/script-plans`
- `GET /api/script-plans/:id`
- `PUT /api/script-plans/:id`
- `DELETE /api/script-plans/:id`
- `PUT /api/script-plans/:id/targets`
- `PUT /api/script-plans/:id/items`

Design note:

- `targets` and `items` are replaced as full lists
- this keeps client-side drag sorting and batch edits simple
- it also avoids partial update drift for plan composition

## Session Matching and Execution Flow

Extend the current session flow in `src/session.ts`.

### Step 1: Resolve target and launch mode

Refactor app launch resolution so the connection flow knows whether the process came from:

- existing process attach
- fresh spawn

Instead of returning only `pid`, app resolution should return:

- `pid`
- `launchMode: "attach" | "spawn"`

Daemon sessions keep their current attach behavior.

### Step 2: Attach and load the base agent

Keep the current base flow:

- resolve device and target
- attach to pid
- create/load the base agent script

This remains the foundation for all existing functionality.

### Step 3: Match plans

After target resolution and before user-facing readiness:

- load all `enabled + autoApply` plans
- filter targets by `platform`, `mode`, and bundle/processName/pid
- sort matching plans by `priority`
- within each plan sort items by `position`

### Step 4: Execute `spawn` items

If the target session was created by spawn:

- run plan items where `injectWhen === "spawn"`
- execute after the base agent is loaded
- execute before `device.resume(pid)`

If the target was not spawned in this session:

- skip all `spawn` items
- report them as skipped, not failed

### Step 5: Resume spawned app

For app sessions launched through spawn:

- call `resume(pid)` after `spawn` items complete

### Step 6: Execute `attach` items

Run all `attach` items:

- after the attach is established
- after resume in the spawn case
- immediately after load in the attach-only case

### Step 7: Publish results

Send a summary to the frontend before or alongside the normal ready state:

- matched plans
- executed items
- skipped items
- failures and errors

## Script Execution Strategy

Do not concatenate user scripts into one mega-script.

Instead:

- execute each plan item individually
- call the existing `script.evaluate` entrypoint once per script
- pass the stored script source and a useful evaluation name

Benefits:

- better per-script error reporting
- easier tracing in logs and UI
- simpler execution ordering

Trade-off:

- all user scripts still run in the same agent JavaScript runtime and can affect shared global state

Documentation should recommend wrapping script bodies in IIFEs or similarly avoiding accidental global leakage.

## Frontend UX

Add two new management surfaces.

### Script Library

Layout:

- left pane: searchable script list
- right pane: Monaco editor with metadata form

Capabilities:

- create script
- rename script
- edit source
- save script
- delete script
- import a single `.js` file into the current draft
- export the selected script as a `.js` file
- import the full library from a `.json` file
- export the full library to a `.json` file

Single-script import behavior:

- read the selected `.js` file in the browser
- derive the default script name from the filename
- populate the current draft instead of saving immediately
- require the user to click save before a new script is persisted

Library export format:

```json
{
  "version": 1,
  "exportedAt": "2026-04-04T12:34:56.000Z",
  "scripts": [
    {
      "name": "trace bootstrap",
      "description": "early hook",
      "source": "send('hi')"
    }
  ]
}
```

Library import behavior:

- accept only the JSON structure above
- fail the import if the payload shape is invalid
- fail the import if any script is missing `name` or `source`
- perform no writes unless the entire payload passes validation
- create new script records for all imported entries
- rename duplicates with suffixes such as `(imported)` and `(imported 2)`

### Injection Plans

Layout:

- left pane: plan list
- right pane: plan editor

Capabilities:

- create/rename/delete plan
- enable or disable plan
- configure auto-apply
- configure continue-on-error
- edit target match rules
- add scripts from the library
- reorder plan items
- set per-item timing to `spawn` or `attach`
- enable or disable individual items

Platform labels in the plan editor:

- display stored platform value `fruity` as `iOS`
- display stored platform value `droid` as `Android`
- submit original stored values unchanged so matching logic and persisted data remain compatible

### Scratch Pad Integration

Keep the current scratch pad.

Add:

- save current draft as new script
- overwrite an existing saved script through an explicit "save to existing script" action

The scratch pad remains the place for experimentation; the library becomes the place for reusable scripts.

## Validation Rules

Minimum v1 validation:

- script `name` cannot be empty
- script `source` cannot be empty
- plan `name` cannot be empty
- plan items cannot reference missing scripts
- duplicate script references inside one plan are rejected
- target rows must satisfy the selected mode requirements
- `injectWhen` must be one of `spawn` or `attach`
- library import payload must include `scripts` as an array
- every imported script must provide string `name` and `source` fields

## Error Handling

Injection failure must not tear down an otherwise valid session.

Policy:

- base agent load failure is fatal to the session
- user script failure is non-fatal
- `continueOnError=true` continues remaining items in the same plan
- `continueOnError=false` stops only the current plan
- other matched plans may still proceed

Every failed item should retain:

- plan id and name
- script id and name
- timing stage
- error text
- elapsed time

## Observability

Create a per-session injection result object and emit it over the socket.

The result should include:

- matched plans
- skipped items
- successful items
- failed items
- timing stage for each item
- summary counts

Frontend presentation in v1:

- show a toast summary after connect
- store the latest injection result in session state
- render a dedicated read-only injection result section in the session UI

No historical persistence is required in v1.

## Testing Strategy

### Storage Tests

- script CRUD
- plan CRUD
- replacing targets/items
- order persistence

### Matching Tests

- app bundle matching
- daemon process-name matching
- pid matching
- platform filtering
- priority ordering

### Session Flow Tests

- `spawn` items run only for spawned sessions
- `attach` items run for attach and spawn sessions
- spawn runs before resume
- attach runs after resume in spawn sessions
- continue-on-error behavior

### Frontend Tests

- script editor create/save/rename/delete
- single-script import populates the draft without auto-saving
- selected script export generates a `.js` payload
- library export generates versioned JSON payload
- library import rejects malformed payloads
- library import renames duplicates instead of overwriting existing scripts
- plan editor target and item updates
- plan editor shows `iOS` and `Android` platform labels while keeping stored values stable
- drag reorder behavior
- scratch pad promotion into script library

## Rollout Plan

1. Add schema and backend stores
2. Add script and plan CRUD routes
3. Add frontend script library UI
4. Add frontend plan editor UI
5. Wire automatic session matching and execution
6. Add socket reporting for injection outcomes
7. Add scratch pad save-to-library path

## Risks

- Shared runtime means user scripts may interfere with one another
- `spawn` timing may behave differently between platforms and process types
- PID-based matching is inherently fragile for long-lived saved rules
- automatic execution increases the importance of clear failure reporting

## Open Decisions Deferred

These are intentionally deferred from v1:

- manual one-click plan execution after connect
- script versioning
- plan history and run history
- conditional matching beyond target identity
