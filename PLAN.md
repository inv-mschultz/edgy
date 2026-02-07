# Edgy — Integration Plan

> Figma plugin that analyzes design flows for missing edge cases and generates actionable reports with component recommendations.

**Team**: 7 designers · **Timeline**: 24 hours (hackathon) · **Stack**: TypeScript, React, Vite, shadcn/ui

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Rule-Based Analysis Engine](#2-rule-based-analysis-engine)
3. [Communication Protocol](#3-communication-protocol)
4. [Module Breakdown](#4-module-breakdown)
5. [Knowledge Base Format](#5-knowledge-base-format)
6. [Canvas Output Design](#6-canvas-output-design)
7. [Concurrent Run Handling](#7-concurrent-run-handling)
8. [Task Assignments](#8-task-assignments)
9. [Timeline](#9-timeline)
10. [Setup & Development Guide](#10-setup--development-guide)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                     FIGMA PLUGIN                         │
│                                                          │
│  ┌─────────────────┐    messages    ┌─────────────────┐  │
│  │  Plugin Sandbox  │◄────────────►│    Plugin UI     │  │
│  │  (main thread)   │              │  (React iframe)  │  │
│  │                  │              │                  │  │
│  │ • Read selection │              │ • Screen picker  │  │
│  │ • Extract nodes  │              │ • Progress view  │  │
│  │ • Export images  │              │ • Results view   │  │
│  │ • Create frames  │              │ • Settings       │  │
│  │ • Place findings │              │ • shadcn/ui      │  │
│  └────────┬─────────┘              └────────┬─────────┘  │
│           │                                 │            │
└───────────│─────────────────────────────────│────────────┘
            │ Figma API                       │ fetch()
            ▼                                 ▼
    ┌───────────────┐              ┌─────────────────────┐
    │ Figma Canvas   │              │  GitHub REST API    │
    │ (read/write)   │              │                     │
    └───────────────┘              └──────────┬──────────┘
                                              │
                                              ▼
                               ┌──────────────────────────┐
                               │  GitHub Repository (edgy) │
                               │                           │
                               │  analyses/{id}/input.json │
                               │         ↓ (push trigger)  │
                               │  ┌────────────────────┐   │
                               │  │  GitHub Action      │   │
                               │  │  analyze.yml        │   │
                               │  │                     │   │
                               │  │  1. Read input.json │   │
                               │  │  2. Load rules YAML │   │
                               │  │  3. Run rule engine │   │
                               │  │  4. Write output    │   │
                               │  └────────────────────┘   │
                               │         ↓                  │
                               │  analyses/{id}/output.json │
                               └──────────────────────────┘
                                              │
                                              ▼
                                   Plugin polls for output
                                   → renders on canvas
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Analysis approach | Rule-based (no AI) | Faster, deterministic, no API costs, sufficient for defined scope |
| Data transfer | GitHub Contents API | Simple file-based, no payload limits, acts as storage + trigger |
| Screen data | Node tree JSON + thumbnail images | JSON for structural analysis, images for report context |
| Results on canvas | New frames next to screens + highlight overlays | Non-destructive, visible, actionable |
| Report | Figma summary frame | Stays in context, shareable with stakeholders |
| Auth | Shared PAT | Simplest for hackathon, single team |
| Concurrency | UUID-based analysis folders | Each run isolated, parallel-safe |

---

## 2. Rule-Based Analysis Engine

### How It Works (No AI Required)

The engine analyzes Figma node trees using **pattern matching** against a knowledge base of rules. Since the designs use a **shadcn Figma UI kit**, component instance names are predictable (Button, Input, Dialog, Select, etc.), making rule-based detection reliable.

### Analysis Pipeline

```
Screen Node Tree
      │
      ▼
┌─────────────────┐
│ Pattern Detector │  → Identifies UI patterns (forms, lists, CTAs, data displays)
│                  │     by matching component instance names and layer structure
└────────┬────────┘
         │  detected patterns[]
         ▼
┌─────────────────┐
│   Rule Engine    │  → For each pattern, checks rules in the matching category
│                  │     e.g., form detected → check error-states.yml rules
└────────┬────────┘
         │  triggered rules[]
         ▼
┌─────────────────┐
│ Expect Checker   │  → For each triggered rule, checks if expected states exist
│                  │     in the same screen or across the flow
└────────┬────────┘
         │  unmet expectations[]
         ▼
┌─────────────────┐
│ Finding Generator│  → Generates findings with severity, description,
│                  │     affected node IDs, and component recommendations
└────────┬────────┘
         │  findings[]
         ▼
┌─────────────────┐
│ Component Mapper │  → Maps each finding to specific shadcn components
│                  │     that would address the missing edge case
└─────────────────┘
```

### What Gets Detected

| Category | Trigger Pattern | What We Check For | Example Finding |
|----------|----------------|-------------------|-----------------|
| **Empty States** | List, Table, Grid, Card repeaters | Empty state frame/component in screen or flow | "This list has no empty state — what does the user see with 0 items?" |
| **Loading States** | Data-dependent content, async triggers | Skeleton, Spinner, Progress components | "This data view has no loading state — add a Skeleton placeholder" |
| **Error States** | Input, Form, TextArea, Select | Error variant, FormMessage, Alert | "These form fields have no error/validation states" |
| **Edge Inputs** | Input, TextArea, Search | Max length, special chars, RTL considerations | "No visible character limit — consider boundary behavior" |
| **Boundary Conditions** | Counters, pagination, numeric displays | Min/max/overflow/zero states | "What happens when this counter reaches 0 or 999+?" |
| **Permissions** | Gated actions, admin features, edit/delete | Disabled states, permission denied screens | "This action has no disabled/unauthorized state" |
| **Connectivity** | Screens with data fetching patterns | Offline state, retry UI, cached content | "No offline/connectivity error handling visible" |
| **Destructive Actions** | Buttons named Delete/Remove/Clear/Reset | Confirmation Dialog, Undo Toast | "This destructive action has no confirmation step" |

### Confidence Levels

Since this is rule-based, some detections will be more confident than others:

- **High confidence**: Component names exactly match rules (e.g., a "Delete" Button with no AlertDialog anywhere in the flow)
- **Medium confidence**: Layer names suggest a pattern (e.g., a frame named "user-list" with repeating children but no "empty" sibling)
- **Low confidence**: Structural heuristics (e.g., a frame with many children that *might* be a list)

Findings include their confidence level so designers can prioritize review.

---

## 3. Communication Protocol

### Step-by-Step Flow

```
PLUGIN (Figma)                          GITHUB
─────────────────                       ──────

1. User selects screens, clicks Analyze
   │
2. Generate analysis_id (UUID v4)
   │
3. Extract node trees + export thumbnails
   │
4. PUT /repos/{owner}/{repo}/contents/
   │  analyses/{analysis_id}/input.json
   │  (base64 encoded, commit to main)
   │──────────────────────────────────────►
   │                                       5. Push triggers workflow
   │                                          (path filter: analyses/*/input.json)
   │                                       │
   │                                       6. Action reads input.json
   │                                       │
   │                                       7. Action loads knowledge/*.yml
   │                                       │
   │                                       8. Action runs rule engine
   │                                       │
   │                                       9. Action writes output.json via
   │                                          Contents API commit
   │  ◄────────────────────────────────────│
10. Plugin polls every 3s:               │
    GET /repos/{owner}/{repo}/contents/
    analyses/{analysis_id}/output.json
   │
11. Output found → parse results
   │
12. Render findings on canvas
   │
13. Generate report frame
   │
14. Place component suggestions
```

### Payload Formats

**input.json**
```json
{
  "analysis_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-02-07T14:30:00Z",
  "file_name": "My Design File",
  "screens": [
    {
      "screen_id": "figma_node_id_123",
      "name": "Login Screen",
      "order": 0,
      "thumbnail_base64": "data:image/png;base64,...",
      "node_tree": {
        "id": "123:456",
        "name": "Login Screen",
        "type": "FRAME",
        "children": [
          {
            "id": "123:457",
            "name": "Email Input",
            "type": "INSTANCE",
            "componentName": "Input",
            "componentProperties": {
              "State": { "value": "Default" },
              "Label": { "value": "Email" }
            },
            "children": []
          },
          {
            "id": "123:458",
            "name": "Submit Button",
            "type": "INSTANCE",
            "componentName": "Button",
            "componentProperties": {
              "Variant": { "value": "Primary" },
              "Label": { "value": "Sign In" }
            },
            "children": []
          }
        ]
      }
    }
  ]
}
```

**output.json**
```json
{
  "analysis_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "completed_at": "2026-02-07T14:30:45Z",
  "summary": {
    "screens_analyzed": 5,
    "total_findings": 12,
    "critical": 3,
    "warning": 6,
    "info": 3
  },
  "screens": [
    {
      "screen_id": "figma_node_id_123",
      "name": "Login Screen",
      "findings": [
        {
          "id": "f-001",
          "rule_id": "error-states/form-fields",
          "category": "error-states",
          "severity": "critical",
          "title": "Form fields missing error states",
          "description": "The email and password inputs have no visible error or validation states. Users won't know what went wrong if they submit invalid data.",
          "affected_nodes": ["123:457", "123:460"],
          "affected_area": {
            "x": 100, "y": 200,
            "width": 300, "height": 80
          },
          "recommendation": {
            "message": "Add error variants for each input field with validation messages below them.",
            "components": [
              {
                "name": "Input (error variant)",
                "shadcn_id": "input",
                "variant": "error",
                "description": "Input field with red border and error styling"
              },
              {
                "name": "Form Message",
                "shadcn_id": "form-message",
                "variant": "destructive",
                "description": "Validation message displayed below the input"
              }
            ]
          }
        }
      ]
    }
  ],
  "flow_findings": [
    {
      "id": "ff-001",
      "rule_id": "connectivity/offline-handling",
      "category": "connectivity",
      "severity": "warning",
      "title": "No offline state in flow",
      "description": "This flow involves data fetching but no screen handles connectivity loss.",
      "recommendation": {
        "message": "Add a screen or overlay showing offline state with retry option.",
        "components": [
          {
            "name": "Alert",
            "shadcn_id": "alert",
            "variant": "destructive",
            "description": "Alert banner showing connectivity error"
          }
        ]
      }
    }
  ]
}
```

---

## 4. Module Breakdown

### 4.1 Figma Plugin — Sandbox (`src/plugin/`)

The sandbox runs on Figma's main thread with full access to the document API.

| File | Responsibility |
|------|---------------|
| `index.ts` | Entry point. Listens for messages from UI, orchestrates extraction → submission → polling → rendering |
| `extractor.ts` | Walks `figma.currentPage.selection`, builds serializable node tree, exports PNG thumbnails |
| `annotator.ts` | Creates finding frames next to each screen, adds highlight rectangles over affected areas |
| `reporter.ts` | Generates a summary report frame with all findings, thumbnails, and stats |
| `component-placer.ts` | Creates component suggestion frames showing recommended shadcn components |

### 4.2 Figma Plugin — UI (`src/ui/`)

React app running in an iframe. Communicates with sandbox via `postMessage`.

| File/Dir | Responsibility |
|----------|---------------|
| `App.tsx` | Root component, routing between views |
| `pages/SelectScreens.tsx` | Shows selected screen names, "Analyze" button |
| `pages/Analyzing.tsx` | Progress indicator, status messages while waiting |
| `pages/Results.tsx` | Summary of findings, per-screen breakdown, actions |
| `pages/Settings.tsx` | GitHub PAT input, repo config |
| `components/` | shadcn/ui components (Button, Card, Badge, Progress, etc.) |
| `lib/github.ts` | GitHub API client (create files, poll for results) |
| `lib/types.ts` | Shared TypeScript types |

### 4.3 Knowledge Base (`knowledge/`)

YAML files defining rules and component mappings. Edited by designers — no code required.

| File | Content |
|------|---------|
| `rules/empty-states.yml` | Rules for detecting missing empty states |
| `rules/loading-states.yml` | Rules for detecting missing loading states |
| `rules/error-states.yml` | Rules for detecting missing error/validation states |
| `rules/edge-inputs.yml` | Rules for input boundary and edge case handling |
| `rules/boundary-conditions.yml` | Rules for numeric/count boundary states |
| `rules/permissions.yml` | Rules for missing permission/auth states |
| `rules/connectivity.yml` | Rules for missing offline/connectivity states |
| `rules/destructive-actions.yml` | Rules for missing confirmation/undo patterns |
| `components/shadcn-catalog.yml` | All shadcn components with variants and use cases |
| `components/component-mappings.yml` | Maps finding types → recommended shadcn components |

### 4.4 Analysis Engine (`analysis/`)

Node.js scripts that run in the GitHub Action.

| File | Responsibility |
|------|---------------|
| `src/index.ts` | Entry point — reads input, runs pipeline, writes output |
| `src/pattern-detector.ts` | Identifies UI patterns in node trees (forms, lists, CTAs, etc.) |
| `src/rule-engine.ts` | Loads YAML rules, matches against detected patterns |
| `src/expect-checker.ts` | Verifies if expected states exist in screen/flow |
| `src/finding-generator.ts` | Creates finding objects with descriptions and severity |
| `src/component-mapper.ts` | Maps findings to shadcn component recommendations |

### 4.5 GitHub Actions (`.github/workflows/`)

| File | Responsibility |
|------|---------------|
| `analyze.yml` | Triggers on push to `analyses/*/input.json`, runs analysis, commits output |

---

## 5. Knowledge Base Format

### Rule File Format

```yaml
# knowledge/rules/error-states.yml

name: Error States
description: >
  Interactive elements should have corresponding error and validation states
  so users understand what went wrong and how to fix it.

rules:
  - id: form-field-errors
    name: Form fields need error states
    severity: critical
    description: >
      Text inputs, selects, and other form fields should show an error
      variant when validation fails, with a helpful message below.
    triggers:
      # Any of these component names in the screen triggers this rule
      component_names:
        - Input
        - Textarea
        - Select
        - Combobox
        - DatePicker
        - RadioGroup
        - Checkbox
      # Also trigger on layer names matching these patterns
      layer_name_patterns:
        - "(?i)(input|field|form|text.?area|select|dropdown)"
    expects:
      # At least one of these should exist in the same screen
      in_screen:
        - component_names: ["Input"]
          with_properties:
            State: "Error"
        - layer_name_patterns: ["(?i)(error|invalid|validation)"]
        - component_names: ["FormMessage", "Form Message"]
      # Or anywhere in the selected flow
      in_flow:
        - layer_name_patterns: ["(?i)error.?state", "(?i)validation"]
    recommendation:
      message: >
        Add error variants for form fields with descriptive validation
        messages. Users need to know what went wrong and how to fix it.
      components:
        - shadcn_id: input
          variant: error
          label: "Input (Error State)"
        - shadcn_id: form-message
          variant: destructive
          label: "Form Validation Message"
        - shadcn_id: alert
          variant: destructive
          label: "Form Error Summary"

  - id: submit-error-feedback
    name: Form submission needs error handling
    severity: critical
    description: >
      Forms with submit actions should handle submission failures
      (server errors, network issues, validation errors).
    triggers:
      component_names:
        - Button
      layer_name_patterns:
        - "(?i)(submit|save|send|create|update|confirm|sign.?in|log.?in|register)"
    expects:
      in_screen:
        - component_names: ["Alert", "Toast", "Sonner"]
        - layer_name_patterns: ["(?i)(error|fail|alert|toast)"]
      in_flow:
        - layer_name_patterns: ["(?i)(error|fail|something.?went.?wrong)"]
    recommendation:
      message: >
        Add error feedback for form submission — an inline alert or
        toast notification showing what went wrong.
      components:
        - shadcn_id: alert
          variant: destructive
          label: "Error Alert"
        - shadcn_id: toast
          variant: destructive
          label: "Error Toast Notification"
```

### Component Catalog Format

```yaml
# knowledge/components/shadcn-catalog.yml

components:
  - id: input
    name: Input
    description: Text input field for forms
    figma_component_key: "input"  # Key in the Figma library
    variants:
      - name: Default
        properties: { State: "Default" }
      - name: Error
        properties: { State: "Error" }
      - name: Disabled
        properties: { State: "Disabled" }
    edge_case_roles:
      - error-states
      - edge-inputs

  - id: skeleton
    name: Skeleton
    description: Placeholder loading animation
    figma_component_key: "skeleton"
    variants:
      - name: Text
        properties: { Type: "Text" }
      - name: Card
        properties: { Type: "Card" }
      - name: Avatar
        properties: { Type: "Avatar" }
    edge_case_roles:
      - loading-states

  - id: alert-dialog
    name: Alert Dialog
    description: Modal confirmation dialog for destructive actions
    figma_component_key: "alert-dialog"
    variants:
      - name: Default
        properties: {}
    edge_case_roles:
      - destructive-actions

  - id: alert
    name: Alert
    description: Callout for important messages
    figma_component_key: "alert"
    variants:
      - name: Default
        properties: { Variant: "default" }
      - name: Destructive
        properties: { Variant: "destructive" }
    edge_case_roles:
      - error-states
      - permissions
      - connectivity

  # ... etc for all shadcn components
```

### Component Mapping Format

```yaml
# knowledge/components/component-mappings.yml

# Maps edge case categories to recommended component sets

mappings:
  empty-states:
    description: "Components for empty/zero-data states"
    primary:
      - shadcn_id: card
        usage: "Container for empty state messaging"
      - shadcn_id: button
        usage: "CTA to create first item or take action"
    supporting:
      - shadcn_id: separator
        usage: "Visual separator if empty state is inline"

  loading-states:
    description: "Components for loading/pending states"
    primary:
      - shadcn_id: skeleton
        usage: "Placeholder mimicking content layout"
      - shadcn_id: progress
        usage: "Determinate progress for known-length operations"
    supporting:
      - shadcn_id: spinner
        usage: "Indeterminate loading indicator"

  error-states:
    description: "Components for error and validation feedback"
    primary:
      - shadcn_id: alert
        variant: destructive
        usage: "Prominent error messaging"
      - shadcn_id: form-message
        variant: destructive
        usage: "Inline field validation"
      - shadcn_id: toast
        variant: destructive
        usage: "Transient error notification"
    supporting:
      - shadcn_id: input
        variant: error
        usage: "Input field in error state"

  destructive-actions:
    description: "Components for confirming irreversible actions"
    primary:
      - shadcn_id: alert-dialog
        usage: "Confirmation modal before destructive action"
      - shadcn_id: toast
        usage: "Undo toast after action completes"
    supporting:
      - shadcn_id: button
        variant: destructive
        usage: "Visually distinct destructive action button"

  permissions:
    description: "Components for access control states"
    primary:
      - shadcn_id: alert
        usage: "Permission denied messaging"
      - shadcn_id: button
        variant: disabled
        usage: "Disabled state for unauthorized actions"
    supporting:
      - shadcn_id: tooltip
        usage: "Explain why action is disabled"

  connectivity:
    description: "Components for network/offline states"
    primary:
      - shadcn_id: alert
        variant: destructive
        usage: "Connection error banner"
      - shadcn_id: button
        usage: "Retry action"
    supporting:
      - shadcn_id: toast
        usage: "Connection restored notification"

  boundary-conditions:
    description: "Components for edge numeric/data states"
    primary:
      - shadcn_id: badge
        usage: "Overflow indicator (99+)"
      - shadcn_id: tooltip
        usage: "Show full value on truncation"
    supporting:
      - shadcn_id: alert
        usage: "Limit reached messaging"

  edge-inputs:
    description: "Components for input edge cases"
    primary:
      - shadcn_id: form-message
        usage: "Character count, format hints"
      - shadcn_id: input
        variant: error
        usage: "Invalid input feedback"
    supporting:
      - shadcn_id: tooltip
        usage: "Input format guidance"
```

---

## 6. Canvas Output Design

### 6.1 Per-Screen Annotations

For each screen with findings, the plugin creates:

```
┌─────────────────────────┐    ┌──────────────────────────────────────┐
│                         │    │ ⚠ FINDINGS: Login Screen             │
│                         │    │──────────────────────────────────────│
│    [Original Screen]    │    │ 🔴 CRITICAL (2)                     │
│                         │    │                                      │
│   ┌─ ─ ─ ─ ─ ─ ─ ─ ┐  │    │ • Form fields missing error states  │
│   │ highlight overlay│  │    │   Affected: Email Input, Password   │
│   │ (semi-transparent│  │    │   → Add Input (error), FormMessage  │
│   │  red rectangle)  │  │    │                                      │
│   └─ ─ ─ ─ ─ ─ ─ ─ ┘  │    │ • No submission error handling      │
│                         │    │   Affected: Sign In button           │
│                         │    │   → Add Alert, Toast (destructive)  │
│                         │    │                                      │
│                         │    │ 🟡 WARNING (1)                      │
│                         │    │                                      │
│                         │    │ • No loading state for sign-in      │
│                         │    │   → Add Button (loading), Spinner   │
│                         │    │                                      │
└─────────────────────────┘    └──────────────────────────────────────┘
```

**Highlight Overlays**: Semi-transparent colored rectangles placed directly over the affected nodes in the original screen:
- Red overlay (10% opacity) = Critical finding
- Yellow overlay (10% opacity) = Warning
- Blue overlay (10% opacity) = Info

The overlays are placed in a dedicated "Edgy Highlights" group that can be toggled on/off.

### 6.2 Summary Report Frame

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  EDGY — Edge Case Analysis Report                                 │  │
│  │  Flow: User Onboarding · 5 screens · Feb 7, 2026                 │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │   12         │ │    3         │ │    6         │ │    3         │   │
│  │  TOTAL       │ │  CRITICAL    │ │  WARNING     │ │  INFO        │   │
│  │  FINDINGS    │ │  ● ● ●      │ │  ● ● ●      │ │  ● ● ●      │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  BY CATEGORY                                                      │  │
│  │  ████████████████░░░░ Error States (4)                            │  │
│  │  ████████████░░░░░░░░ Loading States (3)                          │  │
│  │  ████████░░░░░░░░░░░░ Empty States (2)                            │  │
│  │  ████░░░░░░░░░░░░░░░░ Destructive Actions (1)                    │  │
│  │  ████░░░░░░░░░░░░░░░░ Connectivity (1)                           │  │
│  │  ████░░░░░░░░░░░░░░░░ Permissions (1)                            │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ SCREEN BREAKDOWN ────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  ┌──────────┐  Login Screen ─────────────────────── 🔴 3 findings │  │
│  │  │ thumbnail│  • Form fields missing error states (critical)      │  │
│  │  │          │  • No submission error handling (critical)           │  │
│  │  └──────────┘  • No loading state for sign-in (warning)           │  │
│  │                                                                    │  │
│  │  ┌──────────┐  Dashboard ────────────────────────── 🟡 2 findings │  │
│  │  │ thumbnail│  • No empty state for activity feed (warning)       │  │
│  │  │          │  • No loading skeletons (warning)                   │  │
│  │  └──────────┘                                                      │  │
│  │                                                                    │  │
│  │  ┌──────────┐  Settings ─────────────────────────── 🟡 2 findings │  │
│  │  │ thumbnail│  • Delete account has no confirmation (critical)    │  │
│  │  │          │  • No save confirmation feedback (info)             │  │
│  │  └──────────┘                                                      │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ RECOMMENDED COMPONENTS ──────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  Input (error)  FormMessage  Alert  AlertDialog  Skeleton  Toast  │  │
│  │  ──────────     ───────────  ─────  ───────────  ────────  ───── │  │
│  │  (component suggestion frames are placed separately below)        │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Generated by Edgy · github.com/inversestudio/edgy                      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Component Suggestion Frames

Placed below the report, one frame per recommended component:

```
┌─────────────────────────────────┐
│  📦 Input (Error Variant)       │
│                                 │
│  ┌───────────────────────────┐  │
│  │  [Component preview from  │  │
│  │   Figma library if        │  │
│  │   available, or styled    │  │
│  │   placeholder]            │  │
│  └───────────────────────────┘  │
│                                 │
│  Use for: Error States          │
│  shadcn: Input                  │
│  Needed in: Login, Register,    │
│  Settings screens               │
│                                 │
└─────────────────────────────────┘
```

---

## 7. Concurrent Run Handling

Multiple designers can run analyses simultaneously. Isolation is achieved through:

1. **UUID-based folders**: Each analysis gets `analyses/{uuid}/` — no collision
2. **GitHub Action path filter**: Workflow triggers on `analyses/*/input.json` — each push is independent
3. **Separate workflow runs**: GitHub Actions runs each trigger as a separate job
4. **Polling by ID**: Each plugin instance polls only its own `analyses/{uuid}/output.json`

### Race Condition Prevention

- Each plugin instance generates its own UUID — no shared state
- The Contents API uses SHA-based conflict detection — concurrent writes to different paths don't conflict
- The Action commits output to a different path than input — no write conflicts

### Cleanup

A scheduled GitHub Action (`cleanup.yml`) runs nightly to delete analysis folders older than 24 hours, keeping the repo clean.

---

## 8. Task Assignments

### Team of 7 — Parallel Workstreams

Roles are grouped to minimize dependencies and maximize parallel progress.

#### 🔵 Stream A: Plugin Core (2 people)
**Focus**: Figma plugin sandbox code — screen extraction, canvas manipulation

| Task | Description | Hours |
|------|-------------|-------|
| A1 | Set up plugin project (manifest, Vite, TypeScript) | 0–2 |
| A2 | Implement screen selection + node tree extraction (`extractor.ts`) | 2–6 |
| A3 | Implement thumbnail export for selected screens | 4–6 |
| A4 | Implement finding annotation renderer (`annotator.ts`) | 8–14 |
| A5 | Implement highlight overlays on affected nodes | 12–16 |
| A6 | Implement report frame generator (`reporter.ts`) | 14–20 |
| A7 | Implement component suggestion frame placer (`component-placer.ts`) | 18–22 |
| A8 | End-to-end integration + polish | 22–24 |

#### 🟢 Stream B: Plugin UI (2 people)
**Focus**: React UI iframe — screens, interactions, shadcn/ui styling

| Task | Description | Hours |
|------|-------------|-------|
| B1 | Set up React + Vite + shadcn/ui in plugin UI | 0–3 |
| B2 | Build Settings page (PAT input, repo config) | 2–5 |
| B3 | Build Screen Selection page | 3–7 |
| B4 | Build Analyzing/Progress page | 6–9 |
| B5 | Build Results page (findings summary, per-screen) | 8–14 |
| B6 | Implement GitHub API client (`github.ts` — file creation, polling) | 5–10 |
| B7 | Wire up message passing between UI ↔ sandbox | 8–12 |
| B8 | Polish UI, loading states, error handling | 18–24 |

#### 🟠 Stream C: Analysis Engine (2 people)
**Focus**: Rule engine, pattern detection, finding generation

| Task | Description | Hours |
|------|-------------|-------|
| C1 | Set up analysis project (TypeScript, build config) | 0–2 |
| C2 | Implement pattern detector (identify UI patterns in node trees) | 2–8 |
| C3 | Implement YAML rule loader and rule engine | 4–10 |
| C4 | Implement expect checker (verify state presence) | 8–12 |
| C5 | Implement finding generator with severity and descriptions | 10–14 |
| C6 | Implement component mapper (findings → shadcn components) | 12–16 |
| C7 | Write comprehensive tests with sample node trees | 6–16 |
| C8 | Tune detection accuracy, reduce false positives | 18–22 |

#### 🟣 Stream D: Knowledge Base + Infrastructure (1 person)
**Focus**: Rule authoring, component catalog, GitHub Action, integration

| Task | Description | Hours |
|------|-------------|-------|
| D1 | Write all 8 rule YAML files with comprehensive patterns | 0–8 |
| D2 | Write shadcn component catalog YAML | 2–6 |
| D3 | Write component mapping YAML | 4–8 |
| D4 | Set up GitHub Actions workflow (`analyze.yml`) | 3–6 |
| D5 | Set up cleanup workflow (`cleanup.yml`) | 6–8 |
| D6 | Integration testing — trigger workflow with sample data | 10–14 |
| D7 | Test concurrent runs | 14–18 |
| D8 | Final integration + troubleshooting | 18–24 |

### Dependency Graph

```
Stream A (Plugin Core)     Stream B (Plugin UI)
  A1 ─────────────────────── B1 (both setup, parallel)
  A2 (extractor)             B2, B3 (pages, parallel)
  A3 (thumbnails)            B6 (github client)
       │                          │
       └────── A2+B6 merge ──────┘  ← First integration point (hour ~10)
              Plugin can extract                Plugin can send to GitHub
              │
  A4 (annotator)             B4 (progress page)
  A5 (highlights)            B5 (results page)
       │                          │
       └────── A4+B5 merge ──────┘  ← Second integration point (hour ~16)
              Plugin can render results
              │
  A6 (reporter)              B7 (message wiring)
  A7 (component placer)      B8 (polish)
       │                          │
       └────── Final merge ───────┘  ← Final integration (hour ~22)

Stream C (Analysis Engine)   Stream D (Knowledge + Infra)
  C1 ─────────────────────── D1 (rules authoring, parallel)
  C2 (pattern detector)      D2, D3 (catalogs)
  C3 (rule engine)           D4 (GitHub Action)
       │                          │
       └────── C3+D4 merge ──────┘  ← Engine + Action integration (hour ~10)
              Action can run analysis
              │
  C4 (expect checker)        D6 (integration test)
  C5 (finding generator)     D7 (concurrency test)
  C6 (component mapper)      D8 (troubleshooting)
  C7 (tests)
  C8 (tuning)
```

---

## 9. Timeline

### Hour 0–3: Foundation
- All streams set up their projects and tooling
- Everyone can build and run their part independently
- **Milestone**: All 4 project scaffolds compile and run

### Hour 3–8: Core Implementation
- Stream A: Extraction working — can serialize a Figma selection to JSON
- Stream B: UI shell complete with Settings + Screen Selection pages
- Stream C: Pattern detector + rule engine working with sample data
- Stream D: Rule files drafted, GitHub Action triggers correctly
- **Milestone**: Can manually trigger analysis with hardcoded data

### Hour 8–14: Integration Round 1
- Plugin can extract screens AND send to GitHub
- GitHub Action receives data, runs analysis, writes results
- Plugin can poll and retrieve results
- **Milestone**: End-to-end data flow working (even if rough)

### Hour 14–20: Output & Polish
- Finding annotations appear on canvas
- Highlight overlays on affected areas
- Report frame generated
- Component suggestion frames placed
- UI shows results beautifully
- **Milestone**: Full feature set working

### Hour 20–24: Testing & Demo Prep
- End-to-end testing with real design flows
- Bug fixes and edge case handling (meta!)
- Demo flow preparation
- **Milestone**: Demo-ready plugin

---

## 10. Setup & Development Guide

### Prerequisites

- Node.js 18+
- Figma Desktop app (plugins must be developed locally)
- GitHub account with PAT (repo scope)

### Project Structure

```
edgy/
├── plugin/                    # Figma plugin
│   ├── manifest.json          # Figma plugin manifest
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── plugin/            # Sandbox (main thread)
│       │   ├── index.ts
│       │   ├── extractor.ts
│       │   ├── annotator.ts
│       │   ├── reporter.ts
│       │   └── component-placer.ts
│       └── ui/                # UI iframe (React)
│           ├── index.html
│           ├── main.tsx
│           ├── App.tsx
│           ├── components/    # shadcn/ui
│           ├── pages/
│           ├── lib/
│           └── styles/
├── analysis/                  # Analysis engine
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── pattern-detector.ts
│       ├── rule-engine.ts
│       ├── expect-checker.ts
│       ├── finding-generator.ts
│       └── component-mapper.ts
├── knowledge/                 # Rule definitions (YAML)
│   ├── rules/
│   │   ├── empty-states.yml
│   │   ├── loading-states.yml
│   │   ├── error-states.yml
│   │   ├── edge-inputs.yml
│   │   ├── boundary-conditions.yml
│   │   ├── permissions.yml
│   │   ├── connectivity.yml
│   │   └── destructive-actions.yml
│   └── components/
│       ├── shadcn-catalog.yml
│       └── component-mappings.yml
├── .github/
│   └── workflows/
│       ├── analyze.yml        # Analysis workflow
│       └── cleanup.yml        # Nightly cleanup
├── analyses/                  # Runtime analysis data (gitignored locally)
│   └── .gitkeep
├── PLAN.md                    # This file
├── LICENSE
└── README.md
```

### Quick Start

```bash
# Clone the repo
git clone https://github.com/inversestudio/edgy.git
cd edgy

# Set up the Figma plugin
cd plugin
npm install
npm run dev     # Builds and watches for changes

# In Figma Desktop:
# Plugins → Development → Import plugin from manifest
# Select plugin/manifest.json

# Set up the analysis engine (for local testing)
cd ../analysis
npm install
npm run test    # Run with sample data
```

### Environment Variables

```bash
# Plugin settings (entered by user in plugin UI)
GITHUB_PAT=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_REPO=inversestudio/edgy
```

### GitHub Action Secrets

```
# Set in repo Settings → Secrets → Actions
GITHUB_TOKEN    # Automatically available, used for commits
```
