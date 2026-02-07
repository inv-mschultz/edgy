# Edgy — AI Training Reference

**Edge Case Best Practices from Trusted Sources**

*Compiled for the Edgy Hackathon — February 2026*

This document compiles research-backed best practices for identifying edge cases across common UI flows. It is designed to train Edgy's AI engine so that recommendations are grounded in rigorous, trusted sources — not generic LLM output.

---

## How to Use This Document

This reference is structured around your 8 edge case categories from the PRD. For each category, you'll find: a definition, what to look for when analysing a screen, specific checks per flow type, and the trusted sources backing each recommendation.

Feed these guidelines into Edgy's prompt framework so the AI produces consistent, categorised, research-backed findings — not random suggestions.

---

## 1. Empty States

### Definition

Moments where there is no data to display. This includes first-use experiences (the user hasn't created anything yet), cleared results (search returns nothing), and user-initiated deletions (the user empties their list).

### What to Check on Any Screen

- Does every data container (list, table, card grid, dashboard widget) have a designed empty state?
- Does the empty state communicate WHY it's empty and WHAT the user can do next?
- Is there a clear call-to-action to help the user populate the empty space?
- Does the empty state feel encouraging rather than like a dead end?

### Flow-Specific Checks

| Flow Type | Empty State Questions |
|---|---|
| **Checkout** | What if the cart is empty? Is there a path back to products? |
| **Sign Up / Onboarding** | What does the user's dashboard look like before they've done anything? Is there onboarding guidance? |
| **Dashboard** | What do charts/tables show with zero data? Are widgets meaningful before data exists? |
| **Settings** | What if no integrations are connected? What if notification preferences haven't been set? |
| **Search / Filters** | What happens when a search returns zero results? When all filters are too restrictive? |

### Source Guidelines

**Nielsen Norman Group (2022):** Empty states provide opportunities to communicate system status, increase learnability, and deliver direct pathways for key tasks. Three guidelines: (1) tell the user why the area is empty, (2) provide guidance on how to populate it, (3) use it as a teachable moment.

- [NNG: Designing Empty States in Complex Applications](https://www.nngroup.com/articles/empty-state-interface-design/) — 3 guidelines for content-less containers
- [Carbon Design System: Empty States Pattern](https://carbondesignsystem.com/patterns/empty-states-pattern/) — IBM's pattern for first use, error, and no-data states

---

## 2. Loading States

### Definition

Visual indicators that communicate to the user that the system is processing their request. This includes skeleton screens, spinners, progress bars, and progressive loading patterns.

### What to Check on Any Screen

- Does every action that takes >1 second have a loading indicator?
- Is the right type of indicator used? Skeleton for page loads (<10s), spinner for short waits (2–10s), progress bar for long waits (>10s)
- Do skeleton screens match the actual page layout, or are they generic/blank?
- Is there feedback if loading fails or takes too long? Is there a timeout?
- Is progressive loading used for lists and content-heavy pages (load visible content first)?

### Flow-Specific Checks

| Flow Type | Loading State Questions |
|---|---|
| **Checkout** | What does the user see while payment is processing? Is there a clear "don't close this page" message? |
| **Sign Up** | What happens during account creation? Is there a loading state after submitting the registration form? |
| **Dashboard** | Do individual widgets load independently with their own skeletons? What about slow API responses? |
| **Password Reset** | What's the loading state after submitting the email? Is there confirmation the email was sent? |

### Source Guidelines

**Nielsen Norman Group (2023):** Skeleton screens should match the actual page layout to give users a mental model of what's coming. Use spinners for 2–10s waits, skeleton screens for under 10s page loads, and progress bars with time estimates for anything over 10s. Frame-only skeletons (just header/footer) are equivalent to spinners and not recommended.

**Research finding:** Facebook found skeleton screens led to 300ms faster perceived load time vs. spinners.

- [NNG: Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/) — When to use skeletons vs. spinners vs. progress bars
- [Carbon Design System: Loading Pattern](https://carbondesignsystem.com/patterns/loading-pattern/) — IBM's comprehensive loading pattern guidelines

---

## 3. Error States

### Definition

Feedback shown when something goes wrong — whether caused by the user (form validation), the system (API failure), or the environment (network issues). Error handling is covered by two of Nielsen's 10 heuristics: #5 (Error Prevention) and #9 (Help Users Recover from Errors).

### What to Check on Any Screen

- Does every form field have inline validation with clear, specific error messages?
- Are error messages written in plain language (no codes) and do they suggest a solution?
- Are errors visible using colour AND icon AND text (not colour alone — accessibility)?
- Is there a designed state for API/server errors? For timeout errors?
- Are errors shown AFTER the user has finished interacting with the field, not prematurely?
- Is entered data preserved after an error, so users don't have to re-type?

### Flow-Specific Checks

| Flow Type | Error State Questions |
|---|---|
| **Checkout** | What if the credit card is declined? What if the promo code is invalid? What if the address can't be verified? Is card data retained after a validation error (34% of sites don't)? |
| **Sign Up** | What if the email is already registered? What if the password doesn't meet requirements? Is there real-time password strength feedback? |
| **Password Reset** | What if the email isn't found? What if the reset link has expired? What if the new password matches the old one? |
| **Forms (General)** | Are required and optional fields explicitly marked? Is there both inline validation AND a summary? Are date pickers preventing invalid date entry? |
| **Dashboard** | What does a widget show when its data source fails? Is there a retry option? |

### Source Guidelines

**NNG — 10 Design Guidelines for Errors in Forms (2024):** Use inline validation where possible. Combine colour, icon, and text for error indicators. Write messages that are specific, human-readable, polite, and constructive. Show a validation summary at the top for long forms but always pair with inline messages.

**NNG — Hostile Error Patterns (2024):** Avoid premature validation (errors shown while user is still typing). Don't overload with multiple indicators (asterisk + red border + inline message + icon). Reserve error styling for actual errors, not required-field hints.

**Baymard Institute (2024):** 14% of users abandon checkout if a phone field is required without explanation. 34% of sites don't retain credit card data after validation errors. Mark BOTH required and optional fields explicitly (only 14% of sites do this).

- [NNG: Error Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/) — Comprehensive guide to error message design
- [NNG: 10 Guidelines for Reporting Errors in Forms](https://www.nngroup.com/articles/errors-forms-design-guidelines/) — Form-specific error handling
- [NNG: Hostile Patterns in Error Messages](https://www.nngroup.com/articles/hostile-error-messages/) — Anti-patterns to avoid
- [Baymard: Checkout UX Best Practices](https://baymard.com/blog/current-state-of-checkout-ux) — Research-backed checkout error handling
- [Baymard: Cart & Checkout UX Articles](https://baymard.com/blog/collections/cart-and-checkout) — 70+ articles on checkout usability

---

## 4. Edge Inputs

### Definition

Unusual, extreme, or unexpected data that users might enter — whether intentionally or by accident. This includes very long or very short text, special characters, unexpected formats, and inputs that break layout assumptions.

### What to Check on Any Screen

- What happens with extremely long names, titles, or descriptions? Does text truncate, wrap, or overflow?
- What about single-character inputs or empty strings where text is expected?
- Are special characters handled (emojis, accented letters, RTL text, HTML/script injection)?
- Are input masks or format hints provided for structured data (phone, date, card number)?
- What happens when someone pastes content instead of typing?

### Flow-Specific Checks

| Flow Type | Edge Input Questions |
|---|---|
| **Checkout** | What about international addresses with different formats? Phone numbers with country codes? Card numbers with/without spaces (80% of sites don't auto-format)? |
| **Sign Up** | What about very long email addresses? Names with hyphens, apostrophes, or spaces? Unicode characters in usernames? |
| **Forms** | What if a user pastes formatted text into a plain text field? What about copy-pasting phone numbers with brackets/dashes? |
| **Dashboard** | What if a data label is 200 characters? What if a number is negative or astronomically large? |

### Source Guidelines

**NNG — Edge Cases Article (2025):** Edge cases aren't rare — they're real life. A user with a 200-character last name, someone uploading a 5GB file on rural broadband, a person who clicks 'back' six times during checkout because they got nervous. Design for messy, complicated reality.

**Baymard (2024):** 64% of sites aren't taking advantage of input masking for phone and restricted inputs. Sites should auto-format card numbers with spaces (15% don't). Auto-detect city/state from postal code (28% of mobile sites don't).

- [NNG: The Edge Cases that Break Hearts (And Products)](https://www.nngroup.com/articles/edge-cases/) — Why edge cases matter and how to design for them
- [Baymard: Checkout Form Fields](https://baymard.com/blog/checkout-flow-average-form-fields) — Research on form field optimisation

---

## 5. Boundary Conditions

### Definition

Situations where data or interactions hit the limits of what the system supports — maximum and minimum values, pagination limits, character count limits, file size caps, and overflow scenarios.

### What to Check on Any Screen

- Are maximum character counts communicated before the user hits them?
- What happens when a list has 1 item? 100 items? 10,000 items? Is pagination or infinite scroll designed?
- What if the user tries to upload a file that exceeds the size limit?
- What happens at the last page of pagination? At page 1 with no 'previous'?
- Are numerical inputs constrained (min/max) and is there feedback when limits are hit?

### Flow-Specific Checks

| Flow Type | Boundary Condition Questions |
|---|---|
| **Checkout** | What's the max cart quantity? What if someone adds 999 of an item? What about price overflow for very expensive orders? |
| **Dashboard** | What happens with charts when data range is 0? When there's only 1 data point? When there are millions of rows? |
| **Settings** | What's the max file size for avatar upload? What about maximum number of team members or integrations? |
| **Forms** | What if someone puts 0 or a negative number in a quantity field? What about date ranges where end is before start? |

### Source Guidelines

**Nielsen's Heuristic #5 — Error Prevention:** Prevent problems from occurring by eliminating error-prone conditions. Use constraints (e.g. date pickers, number steppers, character counters) to prevent invalid input rather than just catching it after the fact.

**Baymard:** Average checkout has 11.3 form fields. Reducing form fields directly reduces abandonment. Use smart defaults, auto-detection (city from zip code), and collapsing optional fields to reduce perceived complexity.

- [NNG: 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) — Heuristic #5 covers error prevention through constraints

---

## 6. Permissions & Access

### Definition

Scenarios where users encounter access restrictions — role-based access control, authentication gates, feature paywalls, and actions that require elevated permissions.

### What to Check on Any Screen

- What does a user see if they don't have permission to view this screen or perform this action?
- Are restricted actions hidden, disabled, or shown with an explanation? (Hiding can confuse; disabling without explanation frustrates)
- What happens when a session expires mid-task? Is form data preserved?
- Is there a guest vs. signed-in experience? What's gated behind authentication?
- Is the upgrade path clear when a user hits a paywall or feature limit?

### Flow-Specific Checks

| Flow Type | Permission Questions |
|---|---|
| **Checkout** | Can guests check out or is sign-in required? 60% of testers had trouble finding the guest checkout option (Baymard). |
| **Dashboard** | What does an admin see vs. a viewer? Are edit/delete buttons shown to view-only users? |
| **Settings** | Can all team members change settings or just admins? What's the UI for non-admins? |
| **Sign Up** | Is the sign-up wall justified? Demanding account creation before showing value drives users away (NNG). |

### Source Guidelines

**NNG:** Demanding that users create an account before accessing content is only justified in rare cases. Users go away rather than scale a wall placed between them and your offerings.

**NNG — Disabled Buttons (2025):** Disabled buttons often confuse users by appearing clickable but providing no feedback. Use them sparingly, ensure accessibility, and clearly explain why the button is disabled.

**Baymard — Guest Checkout:** 60% of test subjects had serious trouble finding the guest checkout option. Use progressive disclosure and clearly show all account options upfront.

- [Baymard: Mobile Checkout](https://baymard.com/blog/mobile-checkout) — Guest checkout visibility research

---

## 7. Connectivity

### Definition

States that occur when the user's connection to the server is disrupted, degraded, or unavailable. This includes offline states, slow connections, intermittent connectivity, and sync failures.

### What to Check on Any Screen

- What happens if the user loses connection mid-task? Is their progress saved?
- Is there a visible offline indicator so the user knows they're disconnected?
- What about slow connections — does content degrade gracefully (e.g. low-res images first)?
- When connection returns, does the system sync automatically? Is there conflict resolution?
- Is there a timeout that tells the user the action failed, rather than spinning forever?

### Flow-Specific Checks

| Flow Type | Connectivity Questions |
|---|---|
| **Checkout** | What if connection drops during payment processing? Is the user charged? Is there a way to check order status? |
| **Forms** | Is form data auto-saved locally? Does the user lose all input on a connection drop? |
| **Dashboard** | Are widgets showing stale data? Is there a 'last updated' timestamp? Can the user manually refresh? |
| **Password Reset** | What if the reset email doesn't arrive due to network issues? Is there a resend option with rate limiting? |

### Source Guidelines

**NNG — Edge Cases (2025):** People try to use your app while their internet cuts out every few minutes because they live in rural Montana. Design for both asynchronous and real-time collaboration. Show clear conflict resolution. Make it obvious when someone's changes aren't saving.

**NNG — System Status (Heuristic #1):** The design should always keep users informed about what is going on, through appropriate feedback within a reasonable amount of time. This includes connection status and sync state.

- [NNG: The Edge Cases that Break Hearts](https://www.nngroup.com/articles/edge-cases/) — Real-world connectivity edge cases
- [NNG: 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) — Heuristic #1 — Visibility of System Status

---

## 8. Destructive Actions

### Definition

Actions that permanently delete, overwrite, or remove data — or that have significant, hard-to-reverse consequences. This includes delete confirmations, undo flows, irreversible operations, and account closure.

### What to Check on Any Screen

- Does every destructive action have a confirmation step that clearly states the consequences?
- Is there an undo option where technically feasible (e.g. soft delete with recovery period)?
- Are destructive buttons visually distinct from primary actions (colour, position, labelling)?
- Are confirmation buttons labelled specifically ("Delete Account" not just "Confirm")?
- Is there a review/summary step before irreversible submissions (WCAG 3.3.4 / 3.3.6)?

### Flow-Specific Checks

| Flow Type | Destructive Action Questions |
|---|---|
| **Checkout** | What if the user removes the last item from their cart? Is there a confirmation or undo? Can they recover a cleared cart? |
| **Settings** | Is account deletion behind multiple confirmation steps? Is there a grace period? Are consequences spelled out? |
| **Dashboard** | Can a user accidentally delete a report or widget? Is there bulk delete? Is there undo for bulk operations? |
| **Forms** | Is there a 'clear form' option? If so, is it confirmed? What about accidentally navigating away from an unsaved form? |

### Source Guidelines

**WCAG 3.3.4 (AA) / 3.3.6 (AAA) — Error Prevention:** For pages that cause legal, financial, or data commitments: submissions must be reversible, checked for errors, or confirmed. For AAA: ALL form submissions must include review, undo, or confirmation.

**NNG — Heuristic #5:** Prevent problems by eliminating error-prone conditions or providing confirmation before users commit to actions with serious consequences.

**Accessibility — Destructive Buttons:** Use strong, unambiguous labels like "Delete Account" not "Proceed." Require confirmation dialog stating consequences. Ensure minimum 24x24px target size (WCAG 2.5.8). Ensure visible focus indicators (WCAG 2.4.7).

- [WCAG 2.2 Overview](https://www.w3.org/WAI/standards-guidelines/wcag/) — W3C accessibility standards
- [WebAIM: WCAG 2 Checklist](https://webaim.org/standards/wcag/checklist) — Practical WCAG checklist including error prevention
- [DubBot: Designing Destructive Buttons](https://dubbot.com/dubblog/2025/designing-destructive-buttons-balancing-function-and-accessibility.html) — WCAG-aligned destructive action patterns

---

## Master Source List

All sources referenced in this document, organised by publisher. These are the trusted sources Edgy's AI should be trained on.

### Nielsen Norman Group (NNG)

1. [10 Usability Heuristics for User Interface Design](https://nngroup.com/articles/ten-usability-heuristics/)
2. [The Edge Cases that Break Hearts (And Products)](https://nngroup.com/articles/edge-cases/)
3. [Designing Empty States in Complex Applications: 3 Guidelines](https://nngroup.com/articles/empty-state-interface-design/)
4. [Skeleton Screens 101](https://nngroup.com/articles/skeleton-screens/)
5. [Error Message Guidelines](https://nngroup.com/articles/error-message-guidelines/)
6. [10 Design Guidelines for Reporting Errors in Forms](https://nngroup.com/articles/errors-forms-design-guidelines/)
7. [Hostile Patterns in Error Messages](https://nngroup.com/articles/hostile-error-messages/)
8. [Indicators, Validations, and Notifications](https://nngroup.com/articles/indicators-validations-notifications/)
9. [Mobile-App Onboarding: Components and Techniques](https://nngroup.com/articles/mobile-app-onboarding/)
10. [Onboarding Tutorials vs. Contextual Help](https://nngroup.com/articles/onboarding-tutorials/)
11. [Disabled Buttons (Interaction Design topic)](https://nngroup.com/topic/interaction-design/)

### Baymard Institute

12. [E-Commerce Checkout Usability Research](https://baymard.com/research/checkout-usability)
13. [Checkout UX Best Practices 2025](https://baymard.com/blog/current-state-of-checkout-ux)
14. [Checkout Optimization: Minimize Form Fields](https://baymard.com/blog/checkout-flow-average-form-fields)
15. [Mobile Checkout Usability](https://baymard.com/blog/mobile-checkout)
16. [70 Cart & Checkout UX Articles](https://baymard.com/blog/collections/cart-and-checkout)

### W3C / WCAG

17. [WCAG 2.2 Overview](https://w3.org/WAI/standards-guidelines/wcag/)
18. [WCAG 2.1 Specification](https://w3.org/TR/WCAG21/)
19. [WebAIM WCAG 2 Checklist](https://webaim.org/standards/wcag/checklist)

### Design Systems

20. [Carbon Design System: Empty States](https://carbondesignsystem.com/patterns/empty-states-pattern/)
21. [Carbon Design System: Loading Pattern](https://carbondesignsystem.com/patterns/loading-pattern/)
