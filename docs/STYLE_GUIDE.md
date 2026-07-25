# Nolan's Knives Website And Email Style Guide

This is the source of truth for Nolan's Knives visual design, page structure, component behavior, and email template styling.

The guide has three jobs:

1. Keep the whole website visually unified.
2. Give humans and AI a single place to change the design direction.
3. Make new pages, dashboard features, and email templates feel like Nolan's Knives without redesigning from scratch.

## How To Use This Guide

Before changing website UI, admin UI, business dashboard UI, or email HTML, read this file first.

When a design change is requested:

1. Update this guide if the request changes the system.
2. Update `src/styles/tokens.css` for reusable colors, spacing, type, radius, shadow, and motion.
3. Replace one-off CSS literals with token usage where the affected area is touched.
4. Update website pages, dashboard screens, and email templates to match.
5. Run `npm run build`.
6. For email changes, preview the generated template HTML in the Admin Dashboard Email Templates tab.

When asking AI to make future work, use this prompt:

```text
Read docs/STYLE_GUIDE.md and follow it exactly. If a requested design conflicts with the guide, update the guide first, then update tokens and affected components/pages/templates.
```

## Source Of Truth Files

The written style guide lives here:

- `docs/STYLE_GUIDE.md`

The code-level design tokens live here:

- `src/styles/tokens.css`

The global UI helpers live here:

- `src/styles/global.css`
- `src/components/ui/ui.css`

Major page-level CSS currently lives here:

- `src/pages/main.css`
- `src/components/siteHeader.css`
- `src/pages/ProductPage.css`
- `src/pages/ProductCatalog.css`
- `src/pages/Gallery.css`
- `src/pages/CustomKnifeRequest.css`
- `src/pages/MyKnives.css`
- `src/pages/MyAccount.css`
- `src/pages/BusinessDashboard.css`
- `src/pages/AdminDashboard.css`

Email template defaults and template metadata live here:

- `functions/index.js`

Admin-editable email template overrides are stored in Firebase under:

- `emailTemplates/{templateId}`

## Current Design Direction

Nolan's Knives should feel:

- Handmade, precise, grounded, and trustworthy.
- Dark, sharp, and product-first.
- Premium without feeling glossy or corporate.
- Practical and work-focused in admin/business areas.
- Clear and direct in customer workflows.

## Brand Facts And Copy Guardrails

- Nolan's Knives is based in Huntsville, Alabama.
- Nolan is a self-taught bladesmith who is focused on learning and improving his work.
- Keep public copy grounded in Nolan's actual work, current product records, and information Nolan has supplied.
- Do not invent locations, awards, guarantees, material claims, production methods, timelines, or personal details.
- Avoid decorative marketing "eyebrows," numbered editorial labels, and generic AI-style slogans when the actual page title or product content is clearer.
- Homepage stacked cards should remain a recognizable part of the Nolan's Knives experience. Improve their readability and responsive behavior without removing the stacked interaction on larger screens.
- Use responsive landscape image frames sized to their context: larger for heroes and features, medium for product cards, and shallow for thumbnails. Do not impose one universal ratio. Fill the frame without letterboxing and favor small top-and-bottom crops so the blade tip and handle remain visible.
- The optional priority deposit is 15% of the request estimate. It enables priority review and messages, is credited toward an accepted final quote, and can be refunded if the final quote is declined. A request can also be submitted without payment for standard review.

The site is not a soft lifestyle brand, not a beige artisan brochure, and not a colorful SaaS dashboard. It should feel like a custom knife shop with a serious craft standard.

## Design Principles

1. Product first.
   Photos of knives, details, order/request data, and real customer actions should lead the experience.

2. Dark foundation, gold intent.
   Black and charcoal create the environment. Gold is used for brand emphasis and primary actions.

3. Tight, structured surfaces.
   Panels, forms, cards, and dashboard rows should be dense enough for real use, with enough breathing room to scan.

4. No decorative noise.
   Avoid unrelated gradients, floating shapes, bokeh, cartoon illustrations, and generic stock visuals.

5. Consistent controls.
   Buttons, tabs, cards, badges, forms, tables, modals, toasts, and email CTAs should repeat the same patterns.

6. Responsive by structure, not by shrinking everything.
   Mobile layouts should stack cleanly. Text should not overflow buttons, cards, inputs, or nav items.

7. Email templates are part of the brand.
   Transactional emails and campaigns should use the same black/gold/charcoal identity, but adjusted for email-client reliability.

## Design Tokens

Use `src/styles/tokens.css` as the code-level source for reusable values.

Prefer the `--nk-*` token names in new CSS. Legacy variables such as `--color-accent` remain available for older shared components.

### Color Tokens

| Purpose | Token | Value | Usage |
| --- | --- | --- | --- |
| Page background | `--nk-bg` | `#0a0a0a` | Main app pages, account pages, dashboards |
| Deep background | `--nk-bg-deep` | `#050505` | Recessed areas, code editors, preview frames |
| Soft background | `--nk-bg-soft` | `#0f0f0f` | Form fields, subtle toolbars |
| Standard surface | `--nk-surface` | `#111111` | Panels, dashboard sections |
| Raised surface | `--nk-surface-raised` | `#1a1a1a` | Cards, modals, emphasized containers |
| Muted surface | `--nk-surface-muted` | `#222222` | Hover states, secondary surfaces |
| Border | `--nk-border` | `#2b2b2b` | Cards, inputs, panels |
| Strong border | `--nk-border-strong` | `#3b3b3b` | Active/hover structural borders |
| Brand gold | `--nk-gold` | `#ffcc00` | Primary actions, active tabs, headings, important counts |
| Gold hover | `--nk-gold-hover` | `#ffd700` | Primary action hover states |
| Muted gold | `--nk-gold-muted` | `#d8b949` | Secondary emphasis and metadata |
| Main text | `--nk-text` | `#f4f4f4` | Body text on dark surfaces |
| Strong text | `--nk-text-strong` | `#ffffff` | Headlines and high-emphasis labels |
| Muted text | `--nk-text-muted` | `#b0b0b0` | Paragraphs, summaries |
| Subtle text | `--nk-text-subtle` | `#999999` | Metadata and helper text |
| Faint text | `--nk-text-faint` | `#666666` | Disabled or low-emphasis text |
| Text on gold | `--nk-text-on-gold` | `#111111` | Primary button text |
| Success | `--nk-success` | `#4caf50` | Completed, paid, delivered |
| Warning | `--nk-warning` | `#ffc107` | Pending, attention |
| Danger | `--nk-danger` | `#ff5c5c` | Errors, destructive actions |
| Info | `--nk-info` | `#64b4ff` | Informational statuses |

### Color Usage Rules

- Use gold for primary action, active state, brand highlight, and important numeric totals.
- Do not make entire pages gold, yellow, tan, beige, or brown.
- Use red only for errors, destructive actions, failed payments, blocked users, and irreversible warnings.
- Use blue sparingly for informational states only.
- Use green only for success/completion states.
- Keep dashboard panels charcoal, not pure black, so the workspace has depth.
- Keep pure black mainly for the page foundation and image-backed hero areas.

### Typography Tokens

| Purpose | Token | Usage |
| --- | --- | --- |
| Display and body | `--nk-font-display`, `--nk-font-body` | Oswald-driven brand type |
| Code and HTML editors | `--nk-font-mono` | Template HTML editors, code snippets |
| Small text | `--nk-text-xs`, `--nk-text-sm` | Badges, metadata, labels |
| Body text | `--nk-text-base`, `--nk-text-md` | Paragraphs, form text |
| Section headings | `--nk-text-xl`, `--nk-text-2xl` | Cards, panels, admin pages |
| Page headings | `--nk-text-3xl`, `--nk-text-4xl` | Page titles and hero headings |
| Hero display | `--nk-text-5xl` | Only true first-viewport hero moments |

### Typography Rules

- Use Oswald as the default site typeface.
- Use heavy weights for headings, labels, dashboard totals, and buttons.
- Body copy should use `--nk-leading-normal` (`1.5`) or `--nk-leading-relaxed` (`1.65`) when paragraphs run longer than one line.
- Large Oswald display headings can be tight, but should usually live around `1.25`-`1.35`; long product-name headings should reduce max size before they are allowed to clip, collide, or create awkward eight-line stacks.
- Badges, pills, buttons, table cells, and form controls should use at least `1.25` line-height with vertical padding so wrapped content still fits.
- Keep letter spacing at `0` unless existing uppercase labels require a small positive tracking.
- Do not use negative letter spacing.
- Do not scale font size directly with viewport width.
- Use smaller headings inside compact dashboard panels and cards.
- Use monospaced type only for code, HTML, IDs, logs, template variables, and technical details.

### Spacing Tokens

The spacing system is based on 8px increments with a few half steps.

| Token | Value | Usage |
| --- | --- | --- |
| `--nk-space-1` | `4px` | Tiny gaps, icon nudges |
| `--nk-space-2` | `8px` | Small control gaps |
| `--nk-space-3` | `12px` | Dense card padding |
| `--nk-space-4` | `16px` | Standard panel/card padding |
| `--nk-space-6` | `24px` | Page section spacing |
| `--nk-space-8` | `32px` | Large section spacing |
| `--nk-space-12` | `48px` | Hero and major bands |
| `--nk-space-16` | `64px` | Page-level vertical rhythm |
| `--nk-space-24` | `96px` | Rare large desktop spacing |

Spacing rules:

- Use dense spacing for dashboards and management tools.
- Use more spacious layouts for product, gallery, and store pages.
- Avoid nested card padding that creates card-inside-card visual clutter.
- Buttons should be at least 38px tall on desktop and 42px on touch-first contexts.

### Radius Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--nk-radius-xs` | `4px` | Badges, tiny controls |
| `--nk-radius-sm` | `6px` | Tabs, compact buttons |
| `--nk-radius-md` | `8px` | Standard buttons, inputs, cards |
| `--nk-radius-lg` | `10px` | Larger controls |
| `--nk-radius-xl` | `12px` | Modals, customer cards |
| `--nk-radius-2xl` | `16px` | Rare feature panels |
| `--nk-radius-pill` | `999px` | Pills, status badges, chips |

Radius rules:

- Default cards and panels should be 8px unless the local system already uses 12px.
- Tool surfaces, dashboards, and repeated cards should avoid overly soft rounded corners.
- Pills are allowed for tags, status badges, group chips, and small metadata only.

### Shadows And Depth

- Use shadows sparingly on a dark site.
- Prefer borders plus slight surface contrast.
- Use `--nk-shadow-gold` only for primary action hover or selected product emphasis.
- Do not make entire dashboard sections float with heavy shadows.

### Motion

- Default transitions should use `--nk-transition-fast` or `--nk-transition-base`.
- Motion should clarify interaction, not decorate.
- Respect `prefers-reduced-motion`.
- Avoid large parallax, bouncing, or purely decorative animations.

## Layout System

### Page Widths

- Main max width: `--nk-layout-max-width` (`1280px`)
- Content max width: `--nk-content-max-width` (`1120px`)
- Readable text width: `--nk-readable-width` (`760px`)

Use constrained content inside full-width dark bands.

### Public Page Anatomy

Public customer pages should generally use:

1. Site header
2. Product or task-focused first viewport
3. Clear primary action
4. Supporting product/details content
5. Secondary actions or related content

Do not add marketing-only hero sections when the user is trying to shop, request, pay, or manage an account.

### Dashboard Page Anatomy

Admin and business dashboard pages should generally use:

1. Workspace title, concise supporting copy, and one primary action.
2. Stats row when relevant.
3. Tabs or sidebar navigation for major modes.
4. Toolbar for search/filter/sort.
5. Dense panels, data rows, forms, tables, or flows.
6. Empty/error/loading states.

Dashboard pages should be operational, not promotional.

## Component Guidelines

### Buttons

Primary button:

- Gold background.
- Dark text.
- Used once per major decision area.
- Should include an icon when the action is tool-like or dashboard-related.

Secondary button:

- Charcoal or transparent background.
- Light text.
- Border in `--nk-border`.
- Used for edit, preview, cancel, filter, copy, back, and non-destructive alternatives.

Danger button:

- Red-tinted surface or red border.
- Used for delete, revoke, block, remove, and destructive workflows.

Button text rules:

- Use verbs: `Save`, `Send Campaign`, `Invite User`, `Delete`, `Preview`, `Copy`.
- Keep labels short enough to fit on mobile.
- Buttons must use `inline-flex`, centered alignment, vertical padding, and at least `1.22` line-height so labels can wrap without clipping.
- Use icons from `LucideIcon` when a matching icon exists.
- Do not use text-only rounded rectangles when a familiar icon is enough for compact tools.

### Cards And Panels

Cards are for repeated items or genuinely framed records:

- Product cards
- Order cards
- Saved groups
- User records
- History entries

Panels are for tool areas:

- Forms
- Editors
- Admin sections
- Dashboard detail panes

Rules:

- Do not put UI cards inside other UI cards.
- Do not turn every page section into a floating card.
- Prefer full-width bands or unframed layouts for page sections.
- Use borders and dark surface contrast more than shadows.

### Forms

Inputs:

- Dark control background.
- `--nk-border` border.
- Gold focus border or ring.
- Labels above controls.
- Validation text close to the field.

Selects, checkboxes, toggles, and chips:

- Use native controls where practical.
- Accent selected checkboxes with gold.
- Use pills for compact filters and group chips.

HTML/code editors:

- Monospace font.
- Dark background.
- Minimum height appropriate to task.
- Preserve whitespace.

### Tabs And Segmented Controls

Tabs:

- Dark container.
- Active state is gold background with dark text or gold underline.
- Use for top-level view changes.

Segmented controls:

- Use for mode selection, such as Template vs Custom HTML.
- Active mode should be unmistakable.

### Tables, Rows, And Lists

Operational records should be scan-first:

- Primary label left.
- Metadata below or to the right.
- Status badge visible.
- Row actions grouped to the right on desktop and below on mobile.

Avoid wide paragraph-heavy cards in dashboards.

### Badges And Statuses

Use consistent semantic colors:

- Success: paid, delivered, complete, active.
- Warning: pending, requires attention, temporary failure.
- Danger: blocked, failed, deleted, complained.
- Info: system events, neutral updates.
- Gold: selected, brand, primary totals.

### Modals And Dialogs

Use modals for:

- Confirming destructive actions.
- Focused create/edit flows.
- Previewing content.

Modal rules:

- Include one clear primary action.
- Include a secondary cancel action.
- Keep body text concise.
- Avoid nested modals.

### Toasts

Use toasts for:

- Save success.
- Send success/failure.
- Non-blocking validation.
- Background action results.

Do not rely on toasts for critical information that must be reviewed later.

## Page-Specific Guidelines

### Home Page

The home page should communicate Nolan's Knives quickly:

- Show real knife imagery early.
- Keep the first viewport product/brand-focused.
- Buttons should link to key journeys: store, custom request, gallery.
- Avoid generic welcome copy.
- Home editor content should still follow the same typography, image, button, and spacing rules.

### Store And Product Pages

Priorities:

- Knife imagery.
- Availability/status.
- Price.
- Materials/details.
- Purchase or request action.

Rules:

- Product images must be crisp, inspectable, and not overly darkened.
- Product cards should not overuse decorative copy.
- Availability badges should be obvious.
- Primary purchase CTA should be gold.

### Gallery

Gallery should feel visual and craft-led:

- Use large enough thumbnails to inspect work.
- Keep grid spacing consistent.
- Captions should be short.
- Do not bury images behind excessive text.

### Custom Knife Request

The request flow should feel guided and serious:

- Group related fields.
- Keep price/deposit details explicit.
- Use clear labels for required vs optional information.
- Confirmation pages should summarize the next step.

### Account And My Knives

Customer account pages should feel calm and useful:

- Show status and next action first.
- Keep messages and order details easy to scan.
- Use status badges consistently.
- Do not over-style operational details.

### Business Dashboard

Business dashboard pages are work surfaces:

- Dense but readable.
- Search/filter controls near the top.
- Repeated rows/cards with consistent metadata placement.
- Primary action in the workspace hero.
- Tabs for major modes.
- Use flows for multi-step tasks, such as email campaigns.

### Admin Dashboard

Admin dashboard pages need clarity and auditability:

- Make user/role/security actions explicit.
- Avoid ambiguous destructive controls.
- Display current state before editing.
- Include audit/history context where available.
- Admins can edit other users, but not themselves where permissions require that.

## Email Template Style Guide

Email templates must feel like Nolan's Knives, but email clients are limited. Use inline styles and table-safe/simple HTML where possible.

### Email Goals

Transactional emails should:

- Confirm what happened.
- Show the most important details.
- Give one clear next action.
- Reassure the customer.

Campaign emails should:

- Be specific and useful.
- Use one main CTA.
- Avoid spammy language.
- Respect unsubscribed/suppressed users.

Staff alert emails should:

- Be short.
- Put the action link near the top.
- Include IDs, customer name, price, and status details.

### Email Brand Tokens

Use these values inline in email HTML:

| Purpose | Value |
| --- | --- |
| Outer background | `#0a0a0a` |
| Email body surface | `#111111` |
| Raised detail block | `#1a1a1a` |
| Border | `#2b2b2b` |
| Text | `#f4f4f4` |
| Muted text | `#b0b0b0` |
| Gold | `#ffcc00` |
| CTA text | `#111111` |
| Danger | `#ff5c5c` |
| Success | `#4caf50` |

### Email Layout

Recommended structure:

```html
<div style="margin:0;padding:0;background:#0a0a0a;color:#f4f4f4;font-family:Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="border:1px solid #2b2b2b;background:#111111;border-radius:8px;overflow:hidden;">
      <div style="padding:20px 24px;border-bottom:1px solid #2b2b2b;">
        <div style="font-size:13px;line-height:1.4;color:#ffcc00;font-weight:bold;text-transform:uppercase;">Nolan's Knives</div>
        <h1 style="margin:8px 0 0;color:#ffffff;font-size:26px;line-height:1.2;">Email Title</h1>
      </div>
      <div style="padding:24px;color:#f4f4f4;font-size:16px;line-height:1.6;">
        <p style="margin:0 0 16px;">Hi {{firstName}},</p>
        <p style="margin:0 0 16px;">Main message goes here.</p>
        <p style="margin:24px 0;">
          <a href="{{siteUrl}}" style="display:inline-block;background:#ffcc00;color:#111111;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:6px;">Primary Action</a>
        </p>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #2b2b2b;color:#999999;font-size:13px;line-height:1.5;">
        Questions? Reply to this email or contact {{businessEmail}}.
      </div>
    </div>
  </div>
</div>
```

Email-specific type rules:

- Use Arial or a safe sans-serif stack in email HTML. Web fonts are unreliable in email clients.
- Use `h1` or `h2` sparingly.
- Body text should be 15px to 16px.
- Footer text should be 12px to 13px.
- Keep line-height between 1.45 and 1.65.

Email button rules:

- Primary CTA background: `#ffcc00`.
- CTA text: `#111111`.
- Border radius: 6px.
- Padding: 12px 18px or 12px 20px.
- Only one primary CTA per email unless the email is a staff alert with multiple admin actions.

Email detail block:

```html
<div style="background:#1a1a1a;border:1px solid #2b2b2b;border-radius:8px;padding:16px;margin:20px 0;">
  <p style="margin:0 0 8px;"><strong>Request ID:</strong> {{requestId}}</p>
  <p style="margin:0;"><strong>Total:</strong> {{amount}}</p>
</div>
```

Email variables:

- Use double curly braces: `{{firstName}}`, `{{requestId}}`, `{{siteUrl}}`.
- Only use variables listed in the Admin Dashboard Email Templates tab or `emailTemplateMetadata` in `functions/index.js`.
- Keep fallback copy natural if a variable is empty.
- Never save sample customer names, sample request IDs, or sample prices in production templates. Use variables such as `{{customerName}}`, `{{requestId}}`, and `{{estimatedPrice}}`; previews may render sample values, but the editable HTML should stay variable-based.

### Transactional Email Patterns

Invite email:

- Title: access invitation.
- Details: role, inviter, secure setup link.
- CTA: set up access.
- Include ignore-if-unexpected sentence.

Order confirmation:

- Title: order confirmed.
- Details: order ID, knife name, amount.
- CTA: view order or view my knives.
- Tone: appreciative and clear.

Custom request confirmation:

- Title: request received.
- Details: request ID, estimate, next review step.
- CTA: view request.
- Tone: grounded, no over-promising.

Quote email:

- Title: your custom knife quote.
- Details: final price, deposit due, remaining balance.
- CTA: pay deposit or view request.
- Tone: exact and transparent.

Status update:

- Title: order update.
- Details: status, message from Nolan, request/order ID.
- CTA: view full details.

Unread message reminder:

- Title: message waiting.
- Details: sender, count, order/request ID.
- CTA: view messages.

### Campaign Email Patterns

General campaign:

- Title: specific campaign name.
- Opening: customer-specific greeting.
- Body: one update or one offer.
- CTA: store, gallery, or custom request.
- Closing: short and direct.

New inventory:

- Include what changed.
- Link to store.
- Do not use spammy urgency unless inventory is genuinely limited.

Custom request follow-up:

- Focus on helping the customer start or resume a build.
- Link to custom request page.
- Avoid pressure.

Care tips:

- Useful advice first.
- Link only if there is a relevant next action.

Announcement:

- Keep one subject.
- If there are multiple updates, use short sections with bold labels.

### Email Copy Voice

Use:

- "Thanks for your purchase."
- "Nolan will review your request."
- "You can track this from your account."
- "Questions? Reply to this email."

Avoid:

- "Hurry!!!"
- "Exclusive once-in-a-lifetime deal"
- Overly ornate craft language.
- Corporate support language that sounds detached.

### Email Compliance And Deliverability

- Do not send campaigns to suppressed, unsubscribed, complained, or permanently failed recipients.
- Transactional emails can be sent for required account/order workflows.
- Campaigns should include a clear reason the customer is receiving the email.
- Keep subject lines accurate.
- Avoid all-caps subject lines.
- Keep image usage limited and always include useful text.
- Do not rely on background images in email templates.

## New Page Checklist

Before building a new page:

- Identify page type: public, customer account, admin, business, checkout, or email editor.
- Choose the correct page anatomy from this guide.
- Reuse existing shell/header/dashboard patterns.
- Use `--nk-*` tokens for new CSS.
- Use Lucide icons for tool buttons when available.
- Use real product imagery or existing user data when the page needs visual context.
- Include loading, empty, error, and success states when data is involved.
- Check mobile at narrow widths.
- Run `npm run build`.

## New Email Template Checklist

Before creating or editing an email template:

- Identify template type: transactional, campaign, staff alert, invite, reminder.
- Use the email brand tokens in this guide.
- Use inline CSS.
- Use one primary CTA.
- Include the relevant IDs/details.
- Include a natural support/reply line.
- Use only supported variables.
- Preview in the Admin Dashboard Email Templates tab.
- Send a test if the workflow supports it.

## Style Guide Change Workflow

When changing the style guide itself:

1. Update this file first.
2. Update `src/styles/tokens.css`.
3. Search for old values in CSS and templates.
4. Update affected shared UI helpers.
5. Update page-level CSS only where needed.
6. Update `functions/index.js` email template defaults if email rules changed.
7. Update Firebase email template overrides if they are meant to match the new guide.
8. Build and visually verify.
9. Commit with a message that names the style-guide change.

Useful searches:

```bash
rg "#ffcc00|#111|#1a1a1a|#2b2b2b|border-radius|font-family" src functions
rg "background: #8b6f47|background:#8b6f47" functions src
rg "emailTemplates" functions src
```

## Definition Of Done For Visual Work

A UI change is done when:

- It follows the tokens and patterns in this guide.
- It does not introduce a new one-off color unless the guide is updated.
- It works on mobile and desktop.
- Text does not overflow controls.
- Data-heavy screens remain scan-friendly.
- Empty/loading/error states are present when needed.
- `npm run build` passes.

An email change is done when:

- The HTML follows the email section of this guide.
- The template has a clear subject and one primary action.
- Variables are valid.
- Text is useful without images.
- It previews correctly in the admin email template editor.
- The sending workflow still builds and deploys cleanly.
