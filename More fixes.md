Review the entire existing application and redesign the user experience where necessary. Do not limit this task to fixing isolated components. Evaluate the full public website, customer account experience, business dashboard, and admin dashboard as one connected product.

The application should feel like a premium, professionally designed commerce platform—not a collection of forms, cards, and database controls placed on a page.

Act as an expert UI/UX designer and frontend developer. Make actual improvements to the code, layout, component structure, responsiveness, accessibility, visual hierarchy, and navigation. Do not only describe what should change.

## Overall Design Direction

The site should have a premium, modern, Apple-inspired experience while still preserving the existing Nolan’s Knives branding and visual theme.

The Apple-inspired direction means:

* Spacious layouts
* Strong visual hierarchy
* Minimal clutter
* High-quality typography
* Thoughtful animation
* Smooth page transitions
* Clear calls to action
* Large product imagery
* Refined spacing
* Consistent controls
* Professional icons
* Intuitive navigation
* Mobile-first responsiveness
* Clean separation between content areas
* Simple interfaces that still provide powerful functionality

Do not copy Apple’s website directly. Use the same general standard of polish, simplicity, responsiveness, and attention to detail.

Avoid:

* Overloaded dashboards
* Huge pages containing every feature
* Excessive cards
* Too many bordered containers
* Random gradients
* Emojis used as interface icons
* Inconsistent button styles
* Repetitive headings
* Long forms shown all at once
* Tiny text
* Database IDs shown prominently
* Awkward modal stacking
* Pages that require excessive scrolling to perform basic tasks
* Controls that feel like developer tools instead of business software

## Public Experience Is the Highest Priority

Place the greatest design emphasis on the public-facing website and the customer experience.

The public site is the storefront. It is what potential customers will use to judge whether Nolan’s knives are worth hundreds or potentially thousands of dollars.

The public experience must feel:

* Premium
* Trustworthy
* Handmade
* Personal
* High-end
* Professional
* Easy to understand
* Visually impressive
* Fast and responsive
* Consistent across desktop and mobile

The business and admin dashboards should also be excellent, but they should not visually dominate or determine the design of the public website.

Keep the public website, customer account area, business dashboard, and admin dashboard clearly separated. They may share design tokens and components, but they serve different users and should have different navigation structures.

## Home Page Navigation and Hero Carousel

Fix the home page navigation and carousel layout.

Currently, the navigation bar takes up space above the carousel in a way that causes the bottom of the carousel to extend below the first visible screen. The user must scroll slightly before seeing the complete carousel or hero area.

Change the layout so the navigation bar overlays the top portion of the carousel or hero section.

The first screen should feel intentional and cinematic.

Requirements:

* The carousel should begin at the very top of the page.
* The navigation bar should be positioned over the carousel.
* The full hero area should fit naturally within the initial viewport.
* Users should not need to scroll just to see the bottom of the hero.
* Account for the navigation bar height in the hero sizing.
* Avoid content being hidden behind the navigation bar.
* Keep text and navigation readable over every carousel image.
* Add a subtle overlay, blur, shadow, or adaptive background behind the navigation when necessary.
* The navigation may start transparent and become solid or blurred after scrolling.
* Ensure the mobile navigation behaves properly and does not cover important hero content.
* The hero should scale properly across different viewport heights, including laptops with shorter screens.
* Avoid relying only on `100vh` if it causes mobile browser or navigation-height bugs.
* Use modern viewport units such as `svh` or `dvh` where appropriate.
* Verify that image cropping does not cut off the main subject.
* Keep calls to action within a safe and readable area.
* Preserve good contrast regardless of the current carousel slide.

The result should feel like the navigation and hero were designed as one unified section.

## Navigation Architecture

Do not place every possible feature inside the account dropdown.

The account dropdown should remain simple and focused on personal account actions.

The account menu may contain items such as:

* My Account
* My Knives
* My Orders
* Messages
* Notifications
* Settings
* Sign Out

Administrative and business management features should not be mixed into the normal customer account navigation.

Previously, some account dropdown options were removed entirely. That was not the intended change.

The intended behavior is:

* Customer-related options remain in the customer account area.
* Business-related options are moved into the business dashboard.
* Admin-related options are moved into the admin dashboard.
* Business and admin users should have clear buttons or links that take them to their respective dashboards.
* Do not delete functionality simply because it no longer belongs in the account dropdown.

## Role-Based User Experiences

Create clearly separated experiences for each role.

### Public Visitor

A public visitor should see:

* Home
* Shop or Available Knives
* Individual product pages
* Gallery
* Custom Knife Request
* About Nolan
* Contact
* Sign In or Account

The public navigation should remain elegant and minimal.

### Customer

A signed-in customer should have access to:

* Account overview
* Purchased knives
* Orders
* Custom requests
* Quotes
* Payments
* Messages
* Notifications
* Saved account details
* Delivery or shipping information
* Account settings

Customer pages should be designed around the customer’s knife journey rather than exposing raw database information.

### Business User

A business user should have a dedicated business dashboard with its own navigation.

The business dashboard should contain business-specific sections such as:

* Overview
* Products
* Inventory
* Orders
* Custom Requests
* Quotes
* Customers
* Conversations
* Production
* Shipping
* Notifications
* Email activity
* Reports
* Settings

Do not place all of these sections on one dashboard page.

The dashboard homepage should provide an overview and direct the user into separate, focused sections.

### Admin

An admin should have a dedicated admin dashboard with its own navigation.

The admin dashboard may contain:

* Admin overview
* User management
* Role management
* Business users
* Customer accounts
* Blocked users
* Impersonation tools
* Audit logs
* System notifications
* Email logs
* Payment records
* Database or system health
* Application settings
* Security settings

Admin-only tools must not be mixed into the normal business dashboard unless there is a strong reason.

## Use More Pages, Tabs, and Focused Flows

Do not cram every setting, action, and detail into a single page.

Break complex areas into dedicated pages, tabs, panels, drawers, or step-based flows.

The interface should guide users through tasks instead of presenting everything at once.

Use separate pages when the user is moving into a different task or workflow.

Use tabs when the user is viewing different categories of information about the same item.

Use drawers or side panels for lightweight actions that do not require a full page.

Use modals only for small confirmations or quick actions.

Do not use large modals for complicated forms, product editing, order management, or long workflows.

Examples of appropriate structure:

### Product Management

Use separate views such as:

* Product list
* Create product
* Edit product
* Product preview
* Product images
* Pricing and availability
* Publishing settings
* Product activity

Within an individual product editor, use tabs or a step-based layout such as:

* Details
* Images
* Specifications
* Pricing
* Inventory
* Visibility
* Preview

Do not display every product field in one giant form.

### Order Management

Use:

* Orders list
* Order detail page
* Customer information tab
* Payment tab
* Knife tab
* Fulfillment tab
* Messages tab
* Activity tab

The order detail page should be designed around completing the order, not simply displaying database fields.

### Custom Knife Requests

Use separate sections for:

* New requests
* Paid or verified requests
* Unpaid requests
* Requests awaiting review
* Quotes sent
* Approved projects
* Declined or archived requests

An individual request should have a focused detail page with tabs such as:

* Request summary
* Customer answers
* Reference images
* Estimate and deposit
* Quote
* Messages
* Production
* Internal notes
* Activity history

### Customer Knife View

A customer viewing one of their knives should have a dedicated page with areas such as:

* Overview
* Current status
* Production timeline
* Payments
* Shipping
* Messages
* Documents or images

Do not place every purchased knife and its entire chat history directly on one account page.

## Dashboard Design

Business and admin dashboards should feel like modern professional software.

Use a clear dashboard shell with:

* Sidebar or responsive navigation
* Page title area
* Breadcrumbs where useful
* Search
* Notifications
* User menu
* Contextual actions
* Clear loading states
* Empty states
* Error states
* Success feedback

The dashboard overview should summarize important information without becoming an endless page.

Possible overview sections include:

* Orders requiring action
* New custom requests
* Unread customer messages
* Outstanding quotes
* Payments requiring attention
* Knives currently in production
* Knives ready to ship
* Recent activity

Every summary section should link to its full dedicated page.

Avoid filling the dashboard with decorative statistics that do not help the business make decisions.

Prioritize action-oriented information.

## Public Product Pages

Give every product a premium individual page.

A product page should feel like the page for a unique, valuable handmade item rather than a basic inventory entry.

Consider including:

* Large image gallery
* Full-screen image viewing
* Thumbnail navigation
* Product title
* Price
* Availability
* Short summary
* Detailed description
* Knife specifications
* Materials
* Dimensions
* Steel type
* Handle type
* Sheath information
* Creation story
* Shipping or pickup details
* Payment information
* Purchase call to action
* Contact or question call to action
* Share button
* Related knives
* Trust information
* Mobile purchase controls

The purchase action should remain visible and easy to find without making the page feel aggressive.

For expensive products, provide enough information and visual quality to build confidence.

Use real product imagery prominently. Do not bury product images inside small cards.

## Public Collection and Shop Pages

Redesign the public catalog so it feels like a premium collection.

Include:

* Strong page introduction
* High-quality product cards
* Large images
* Clear price and availability
* Filters that do not overwhelm the page
* Sorting where useful
* Search where useful
* Responsive grid behavior
* Helpful empty states
* Loading skeletons
* Pagination or controlled loading for performance

Product cards should have consistent image ratios and spacing.

Do not show internal statuses or business-only information.

Consider distinguishing between:

* Available now
* Custom examples
* Recently completed
* Sold pieces
* Limited releases

Avoid making sold products look identical to available products.

## Customer Account Experience

The customer account should not feel like a simplified admin dashboard.

It should feel personal and centered around the customer’s knives, requests, messages, and next actions.

The account homepage should answer:

* What knives do I own?
* What orders are currently active?
* What stage is my custom knife in?
* Do I have unread messages?
* Do I owe a payment?
* Has my order shipped?
* Is Nolan waiting for a response from me?

Use clear cards or sections that link into dedicated detail pages.

Avoid displaying raw IDs, Firebase keys, payment provider IDs, or internal status names.

## Professional Icons

Remove emojis used as interface symbols.

Use a consistent professional icon library such as:

* Lucide
* Heroicons
* Material Symbols
* Font Awesome, if already properly integrated

Choose one primary icon system and use it consistently.

Icons should:

* Match the visual style
* Have consistent stroke width
* Use consistent sizing
* Include accessible labels or supporting text
* Not replace important text when the meaning may be unclear
* Be decorative only when appropriate
* Avoid excessive use

Do not use emoji characters for:

* Navigation
* Order status
* Editing
* Deleting
* Shipping
* Messages
* Users
* Settings
* Payments
* Production stages
* Warnings
* Success messages

Use recognizable professional symbols instead.

## Forms and Multi-Step Flows

Evaluate every form in the application.

Large or complex forms should be divided into manageable sections or multi-step flows.

For example, the custom knife request should use:

* One question or topic group at a time
* Large selectable options
* Clear labels
* Helpful descriptions
* Progress indicator
* Back and continue controls
* Automatic saving where appropriate
* Validation before advancing
* Final review page
* Clear confirmation after submission

Do not force the user to scroll through a huge form.

For dashboard forms, use logical tabs or sections with sticky actions where appropriate.

Ensure users do not lose unsaved work accidentally.

Warn before leaving a dirty form.

Provide clear inline validation rather than only showing a generic error after submission.

## UI and CSS Quality Review

Inspect the full application for HTML, CSS, React, and layout problems that could make dynamic pages difficult to use.

Specifically look for:

* Fixed heights that break with dynamic content
* Containers using `overflow: hidden` incorrectly
* Forms cut off on smaller screens
* Modals exceeding viewport height
* Z-index conflicts
* Sticky headers covering content
* Dropdowns rendering behind other elements
* Horizontal scrolling
* Text wrapping problems
* Buttons shrinking too far
* Cards with inconsistent heights
* Images stretching or distorting
* Layout shifts while content loads
* Hard-coded widths
* Incorrect use of `100vh`
* Mobile browser viewport issues
* Excessive nested flex layouts
* Missing `min-width: 0`
* Grid layouts that overflow
* Absolute positioning used where normal layout would be better
* Long text breaking tables or cards
* Tables that are unusable on mobile
* Forms with labels detached from fields
* Inconsistent spacing
* Inconsistent border radii
* Inconsistent shadows
* Duplicate CSS
* Overly broad global selectors
* CSS specificity conflicts
* Components that depend on fragile parent styling
* Missing hover, focus, active, disabled, and loading states
* Poor keyboard navigation
* Insufficient contrast
* Missing accessible names
* Small touch targets
* Content hidden behind mobile navigation
* Page content jumping when dialogs open
* Scroll locking bugs
* Body overflow not restored after modals
* Dynamic page heights causing blank space or clipping
* Uncontrolled image sizes causing performance problems

Fix the problems found instead of only listing them.

## Tables and Mobile Data Views

Do not force desktop tables onto mobile screens.

For business and admin data:

* Use tables on larger screens where appropriate.
* Use responsive cards, stacked rows, or detail summaries on mobile.
* Keep important actions visible.
* Allow filtering and search without consuming the whole screen.
* Avoid horizontal scrolling unless the data truly requires it.
* Keep selection controls and bulk actions understandable.

## Responsive Design

Evaluate every page at multiple screen sizes.

At minimum, verify:

* Small phones
* Large phones
* Tablets
* Small laptops
* Desktop monitors
* Short viewport heights
* Landscape mobile layouts

The site should not merely shrink. Layouts should reorganize intelligently.

Examples:

* Sidebars should collapse into drawers.
* Tables should transform into mobile-friendly views.
* Multi-column forms should become single-column.
* Hero text should resize and reposition.
* Product purchase controls may become sticky on mobile.
* Tabs should scroll or transform when needed.
* Long button rows should wrap or collapse into action menus.

Do not remove important features from mobile unless absolutely necessary.

## Animation and Interaction

Use motion carefully to make the experience feel polished.

Appropriate examples include:

* Smooth dropdown opening
* Subtle page transitions
* Image gallery transitions
* Button feedback
* Loading skeletons
* Progress transitions
* Toast notifications
* Expanding detail sections
* Animated status changes

Avoid:

* Excessive animation
* Slow animations
* Motion on every element
* Decorative animation that delays task completion
* Large parallax effects that hurt performance
* Animations that ignore reduced-motion preferences

Support `prefers-reduced-motion`.

## Loading, Empty, Success, and Error States

Every dynamic page should have designed states.

Do not leave blank areas while data loads.

Add:

* Loading skeletons
* Empty states
* Error messages
* Retry actions
* Success confirmations
* Disabled states
* Processing indicators
* Helpful first-use guidance

Examples:

* No products created
* No orders received
* No custom requests
* No unread messages
* No purchased knives
* No search results
* Failed image upload
* Payment processing
* Quote sent successfully
* Product saved successfully

These states should look intentional and should guide the user toward the next action.

## Reusable Design System

Create or improve a consistent design system for the application.

Define reusable values and components for:

* Typography
* Spacing
* Colors
* Shadows
* Border radii
* Buttons
* Inputs
* Select controls
* Cards
* Dialogs
* Tabs
* Status badges
* Alerts
* Tooltips
* Navigation
* Page headers
* Empty states
* Loading states
* Icons

Avoid one-off styles for every page.

Reuse consistent components across the application while allowing the public site and dashboards to have their own layouts.

## Preserve the Nolan’s Knives Theme

The redesign should still feel connected to custom knife craftsmanship.

Use the existing branding, imagery, and theme as the foundation.

The visual experience may incorporate:

* Dark metal tones
* Warm neutral colors
* Wood-inspired accents
* High-quality product photography
* Refined serif headings paired with clean interface typography
* Subtle texture
* Strong contrast
* Premium editorial layouts

Do not make the website feel like a generic technology startup dashboard.

The public website should feel like a premium craftsman brand.

The dashboards should feel modern and efficient while remaining visually connected to the brand.

## Implementation Requirements

Before changing the interface:

1. Inspect the current routes.
2. Inspect the current navigation.
3. Inspect authentication and roles.
4. Identify all customer, business, and admin pages.
5. Identify duplicated or misplaced functionality.
6. Identify components that are too large or overloaded.
7. Identify pages that need to be split into routes, tabs, or flows.
8. Review the CSS architecture and responsive behavior.
9. Review icon usage.
10. Review forms and dynamic page behavior.

Then implement the improvements.

Do not:

* Remove features because they are inconvenient to redesign.
* Replace working functionality with static mockups.
* Create buttons that do nothing.
* Build visual-only dashboard pages without connecting data.
* Duplicate the same functionality in several places.
* Keep business tools in the customer account menu.
* Put entire workflows inside oversized modals.
* Use emojis as permanent interface icons.
* Redesign only the dashboard while ignoring the public website.
* Redesign only the home page while leaving the rest inconsistent.

## Expected Navigation Structure

Use this as a starting point, but adapt it to the existing app where needed.

### Public Site

* Home
* Shop
* Product Details
* Gallery
* Custom Knife Request
* About
* Contact

### Customer Account

* Overview
* My Knives
* Orders
* Custom Requests
* Quotes
* Messages
* Notifications
* Settings

### Business Dashboard

* Overview
* Products
* Inventory
* Orders
* Custom Requests
* Quotes
* Customers
* Messages
* Production
* Fulfillment
* Notifications
* Reports
* Business Settings

### Admin Dashboard

* Overview
* Users
* Roles
* Business Accounts
* Customers
* Blocked Accounts
* Impersonation
* Audit Logs
* Payments
* Email Logs
* Notifications
* System Settings

Do not necessarily place every navigation item at the top level. Use grouped sidebar sections, sub-navigation, tabs, and detail routes where that creates a clearer experience.

## Final Goal

The completed application should feel like three professionally designed products working together:

1. A premium public storefront for expensive handcrafted knives.
2. A simple customer portal for purchases, custom orders, payments, updates, and conversations.
3. A powerful but easy-to-use business and administration system.

The public website should receive the highest visual attention.

The business dashboard should prioritize speed and clarity.

The admin dashboard should prioritize control, security, and auditability.

All three experiences should feel connected, intentional, and professionally designed.

After implementation, provide:

* A summary of the major redesigns
* New pages and routes created
* Pages split into tabs or separate flows
* Navigation changes
* Components created or replaced
* CSS and responsiveness fixes
* Accessibility improvements
* Icon library used
* Features moved from the account dropdown
* Remaining limitations
* A test checklist for public, customer, business, admin, desktop, tablet, and mobile experiences


## Premium Animation and Interaction Pass

Add a polished animation and interaction system across the entire app. The goal is to make the experience feel dramatically more premium, responsive, intuitive, and satisfying without becoming distracting or slow.

Use animations to improve clarity, not just decoration. Add:

* Smooth page and route transitions
* Refined hover, press, focus, and loading feedback
* Subtle scroll-reveal animations
* Premium menu, dropdown, tab, drawer, and modal transitions
* Smooth carousel and product-gallery movement
* Animated progress indicators for multi-step forms
* Natural status, notification, and success transitions
* Skeleton loading states instead of blank screens or generic spinners
* Smooth layout transitions when content changes, filters update, or elements expand
* Immediate visual feedback for saving, uploading, sending, purchasing, and form validation
* Tasteful image zoom, parallax, or depth effects only where they improve the public storefront

Animations should feel natural and responsive, with most interactions completing quickly. Avoid excessive bouncing, flashing, slow fades, or animations that delay users.

Use a consistent motion system with shared durations, easing curves, and reusable components. Prefer GPU-friendly `transform` and `opacity` animations. Prevent layout shifts, animation jank, and mobile performance issues.

Respect `prefers-reduced-motion`, preserve keyboard accessibility, and ensure every feature remains fully usable without animation.

Do not only add animations to the home page. Evaluate the public site, customer portal, business dashboard, admin dashboard, forms, product pages, chat, notifications, and loading states.

The final result should feel closer to a premium Apple product experience than a typical web dashboard, while still matching Nolan’s Knives branding.
