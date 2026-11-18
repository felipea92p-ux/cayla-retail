# Motion guidelines in leading design systems (state as of Nov 2026)

Method note: many official doc sites (m3.material.io, developer.apple.com HTML, polaris.shopify.com) render only with JavaScript, so exact token values were taken from each system's **official source code / published token packages** (GitHub raw files, npm tarballs) where the docs page could not be read. Package versions inspected on 2026-11-12: `@atlaskit/tokens` 20.11.0, `@salesforce-ux/design-system` 2.264.3, `@adobe/spectrum-tokens` 15.7.0, `@radix-ui/themes` 3.3.0; GitHub `main`/`master` branches for Fluent UI, Primer Primitives, Polaris, Base Web, Material Components Android, AndroidX Compose Material3.

## Material Design 3 and Material 3 Expressive: springs, legacy easing/duration, transition patterns

### Takeaway
M3 now has two motion systems side by side. One is a **spring (physics) system**: 6 springs (fast/default/slow × spatial/effects), each set by damping ratio and stiffness, in two schemes, *standard* and *expressive* (Expressive came in 2025). The other is the older **easing + duration curve system**: 7 easings and 16 durations from 50 ms to 1000 ms. The four transition patterns (container transform, shared axis, fade through, fade) are still documented.

### Cited Findings
**Spring system (Compose Material3 source, the primary implementation)**
- `MotionScheme.standard()` and `MotionScheme.expressive()` are the two public schemes. Each defines DefaultSpatial, FastSpatial, SlowSpatial, DefaultEffects, FastEffects and SlowEffects — [MotionScheme.kt](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/MotionScheme.kt); [MotionSchemeKeyTokens.kt](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/MotionSchemeKeyTokens.kt)
- **Standard scheme** (damping ratio / stiffness): FastSpatial 0.9 / 1400; DefaultSpatial 0.9 / 700; SlowSpatial 0.9 / 300; FastEffects 1.0 / 3800; DefaultEffects 1.0 / 1600; SlowEffects 1.0 / 800 — [StandardMotionTokens.kt](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StandardMotionTokens.kt)
- **Expressive scheme** (damping ratio / stiffness): FastSpatial 0.6 / 800; DefaultSpatial 0.8 / 380; SlowSpatial 0.8 / 200. The Effects springs are the same as in Standard (1.0 / 3800, 1.0 / 1600, 1.0 / 800) — [ExpressiveMotionTokens.kt](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExpressiveMotionTokens.kt)
- MDC-Android documents the same six standard springs as theme attributes:
  - `motionSpringFastSpatial` (damping 0.9, stiffness 1400): "small components like switches and buttons"
  - `motionSpringFastEffects` (1, 3800): "small component effects like color and opacity"
  - `motionSpringDefaultSpatial` (0.9, 700): "animations that partially cover the screen like a bottom sheet or nav drawer"
  - `motionSpringSlowSpatial` (0.9, 300): "full screen animations"
  - Source: [MDC-Android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
- Spatial vs effects: "Spatial springs are used for animations that move something on screen - like the x & y position of a View. Effects springs are used to animate" properties like color and opacity. Example: animating a button press uses `motionSpringFastSpatial` for shape/size plus `motionSpringFastEffects` for color — [MDC-Android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
- Choosing a speed: small components use the fast spring, full-screen animations or transitions use the slow spring, and "everything in between should use the default spring" — [MDC-Android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
- Material announced the Expressive motion theming system in the blog post "M3 Expressive: New Motion System" ("new customizable motion theming system"). The body could not be loaded because the page needs JS — [m3.material.io blog](https://m3.material.io/blog/m3-expressive-motion-theming)

**Curve system (easing + duration)**
- Easing tokens:
  - Standard `cubic-bezier(0.2, 0, 0, 1)`
  - StandardDecelerate `(0, 0, 0, 1)`
  - StandardAccelerate `(0.3, 0, 1, 1)`
  - Emphasized is a path, not a single bezier: `M 0,0 C 0.05,0, 0.133333,0.06, 0.166666,0.4 C 0.208333,0.82, 0.25,1, 1,1`
  - EmphasizedDecelerate `(0.05, 0.7, 0.1, 1)`
  - EmphasizedAccelerate `(0.3, 0, 0.8, 0.15)`
  - Linear `(0, 0, 1, 1)`
  - Usage: "Emphasized" is for "common, M3-styled animations"; "Standard" is for "utility focused animations"
  - Source: [MDC-Android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
- Duration tokens: Short1–4 = 50/100/150/200 ms; Medium1–4 = 250/300/350/400 ms; Long1–4 = 450/500/550/600 ms; ExtraLong1–4 = 700/800/900/1000 ms. Rule: "duration should increase as the area/traversal of an animation increases" — [MDC-Android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)

**Transition patterns**
- The four patterns are Container transform; Shared axis ("or Forward and Backward"); Fade through ("or Top Level"); and Fade ("or Enter and Exit") — [MDC-Android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
- Container transform defaults as documented: incoming 300 ms (attribute `motionDurationLong1`), outgoing 250 ms (`motionDurationMedium2`), easing `cubic-bezier(0.4, 0.0, 0.2, 1)` "FastOutSlowIn". Fade thresholds are [0.0–0.25] on enter and [0.6–0.9] on return. Durations differ for incoming vs outgoing by default — [MDC-Android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
- Shared axis: X/Y axes slide by a distance and the Z axis scales; content fades through; documented default 300 ms with `cubic-bezier(0.4, 0.0, 0.2, 1)` — [MDC-Android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)

### Inferences
- In Expressive, only the **spatial** springs become bouncier and softer (damping 0.6–0.8 instead of 0.9, with lower stiffness). Color/opacity "effects" springs stay critically damped (1.0) in both schemes, so effects never overshoot.
- The transition-pattern tables in MDC-Android still give M2-era values (`0.4,0,0.2,1`, 300/250 ms). These do not match the M3 duration table, where `motionDurationLong1` = 450 ms, not 300 ms. Treat those defaults as **legacy/inconsistent documentation**.
- Calling the curve system "legacy" is reasonable: Compose's new `MotionScheme` is entirely springs. However, I found no primary source that explicitly labels easing/duration tokens as deprecated.

### Gaps
- I could not read m3.material.io pages (they need JS), so I have no official wording on whether easing/duration is "legacy" in M3 Expressive and no M3 Expressive per-component guidance (e.g., FAB menu, loading indicator morphs).
- No web (CSS) spring tokens for M3 were found.

## Apple Human Interface Guidelines: principles, SwiftUI springs, fluid interfaces, Liquid Glass

### Takeaway
Apple's HIG Motion page is short and mostly about principles: be purposeful, keep motion optional, be brief and precise, let people cancel motion, and avoid motion on frequent interactions. The engineering model is springs defined by perceptual **duration + bounce**, with bounce 0 as the default. Interruptibility and velocity continuity are central. Liquid Glass motion (added 9 Sep 2025) reacts more strongly to direct touch than to a trackpad.

### Cited Findings
- "Add motion purposefully, supporting the experience without overshadowing it… Gratuitous or excessive animation can distract people and may make them feel disconnected or physically uncomfortable." — [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion) (markdown: [motion.md](https://developer.apple.com/design/human-interface-guidelines/motion.md))
- "Make motion optional": never make motion the only way to convey information; supplement it with haptics/audio — [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion.md)
- "Aim for brevity and precision in feedback animations"; "In apps, generally avoid adding motion to UI interactions that occur frequently"; "Let people cancel motion… don't make people wait for an animation to complete" — [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion.md)
- Realistic feedback: "if someone reveals a view by sliding it down from the top, they don't expect to dismiss the view by sliding it to the side." — [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion.md)
- Liquid Glass: its movement "responds to direct touch interaction with greater emphasis… but produces a more subdued effect when a person interacts using a trackpad." The change log reads "September 9, 2025 — Added guidance for Liquid Glass" — [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion.md)
- visionOS: avoid motion at the edges of the field of view; use fades to relocate objects; avoid rotating the virtual world; avoid sustained oscillation near 0.2 Hz — [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion.md)
- Games: 30–60 fps consistent frame rate — [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion.md)
- WWDC23 "Animate with springs":
  - Springs are parameterized by perceptual **duration** and **bounce** (−1 to 1). Bounce 0 is critically damped; >0 overshoots; <0 is overdamped (useful for decaying scroll velocity)
  - Omitting bounce gives 0, "the most versatile"
  - Guidance: ~0.15 is "brisker, barely bouncy", ~0.3 is noticeable, above ~0.4 is too exaggerated for most UI
  - Conversion: stiffness = (2π/duration)², damping = 1 − 4π·bounce/duration (bounce ≥ 0)
  - Springs preserve gesture velocity and retarget mid-flight using their current velocity (interruptibility). SwiftUI's default animation is a spring
  - Source: [WWDC23 10158](https://developer.apple.com/videos/play/wwdc2023/10158/)
- SwiftUI `.snappy`: "A spring animation with a predefined duration and small amount of bounce that feels more snappy" — [Apple docs](https://developer.apple.com/documentation/swiftui/animation/snappy.md)
- WWDC18 "Designing Fluid Interfaces":
  - Interfaces should accept changes of intent at any point (interruptible, redirectable)
  - Springs are specified by **damping** (100% = no overshoot) and **response** instead of duration
  - Use 100% damping for taps with no momentum (e.g., Music opening Now Playing) and ~80% damping when the gesture carries momentum (swipe-dismiss)
  - Project landing points from release velocity using the scroll deceleration rate; keep content tracking the finger 1:1; swipes begin after ~10 pt hysteresis; rubberband at boundaries
  - Source: [WWDC18 803](https://developer.apple.com/videos/play/wwdc2018/803/)

### Inferences
- Apple deliberately publishes **no ms duration tokens** for UI. Its system is "spring + system components animate themselves", with the 0.5 s duration / 0 bounce default spring as the baseline. The 0.5 s default is commonly cited but I did not verify it on an Apple page this session (see Gaps).

### Gaps
- I could not confirm the exact default duration/bounce values of `.smooth`, `.snappy` and `.bouncy`. The Apple docs page gives only qualitative descriptions; general knowledge (unverified) says snappy ≈ bounce 0.15, bouncy ≈ 0.3, smooth = 0, all 0.5 s.
- No Liquid Glass-specific motion parameters (e.g., morph timing) were found in HIG.

## Microsoft Fluent 2

### Takeaway
Fluent 2 states four principles: functional, natural, consistent, appealing. Its docs page is qualitative. The exact tokens live in the Fluent UI token package: 8 durations from 50 to 500 ms and 9 curves in accelerate / decelerate / easy-ease families.

### Cited Findings
- Principles: Functional, Natural (follows "inertia, gravity, weight, and velocity"), Consistent, Appealing. Larger elements get more time based on size and distance traveled — [Fluent 2 Motion](https://fluent2.microsoft.design/motion)
- Patterns: Enter/exit (menus, dialogs); Elevation (button states, drag and drop); Top level (navigate between main pages with "a quick fade rather than sliding large elements"); Container transform. Choreography: prefer staggering with short offsets; use non-staggered motion only for very large sets; important elements get longer, more prominent motion — [Fluent 2 Motion](https://fluent2.microsoft.design/motion)
- Accessibility: provide a "no motion" setting, keep durations short, limit motion to the focused element, use ARIA live regions — [Fluent 2 Motion](https://fluent2.microsoft.design/motion)
- Duration tokens: durationUltraFast 50ms, durationFaster 100ms, durationFast 150ms, durationNormal 200ms, durationGentle 250ms, durationSlow 300ms, durationSlower 400ms, durationUltraSlow 500ms — [fluentui tokens durations.ts](https://raw.githubusercontent.com/microsoft/fluentui/master/packages/tokens/src/global/durations.ts)
- Curve tokens:
  - curveAccelerateMax `(0.9,0.1,1,0.2)`, curveAccelerateMid `(1,0,1,1)`, curveAccelerateMin `(0.8,0,0.78,1)`
  - curveDecelerateMax `(0.1,0.9,0.2,1)`, curveDecelerateMid `(0,0,0,1)`, curveDecelerateMin `(0.33,0,0.1,1)`
  - curveEasyEaseMax `(0.8,0,0.2,1)`, curveEasyEase `(0.33,0,0.67,1)`, curveLinear `(0,0,1,1)`
  - Source: [fluentui tokens curves.ts](https://raw.githubusercontent.com/microsoft/fluentui/master/packages/tokens/src/global/curves.ts)

### Inferences
- Fluent's naming suggests decelerate curves are for entering and accelerate curves for exiting. The public page describes easing types only generically (linear/ease-in/ease-out/ease-in-out).

### Gaps
- I found no official per-component Fluent 2 mapping (e.g., which token a dialog uses).

## IBM Carbon

### Takeaway
Carbon has two motion styles. **Productive** motion is subtle and efficient, for task-focused moments. **Expressive** motion is reserved for significant moments. It has 6 duration tokens (70–700 ms) and standard/entrance/exit curves for each style.

### Cited Findings
- Principles: Purposeful, Responsive, Meticulous, Unobtrusive ("If average users notice it often, reduce or remove it"), Natural easing (avoid linear and decorative easing), Adaptive (reduced-motion and low-power alternatives) — [Carbon Motion overview](https://carbondesignsystem.com/elements/motion/overview/)
- Productive motion suits button states, dropdowns and data tables. Expressive motion is for opening a new page, a primary action click, or system alerts — [Carbon Motion overview](https://carbondesignsystem.com/elements/motion/overview/)
- Durations: fast-01 70ms, fast-02 110ms, moderate-01 150ms, moderate-02 240ms, slow-01 400ms, slow-02 700ms — [Carbon Motion overview](https://carbondesignsystem.com/elements/motion/overview/)
- Curves:
  - Productive: standard `(0.2,0,0.38,0.9)`, entrance `(0,0,0.38,0.9)`, exit `(0.2,0,1,0.9)`
  - Expressive: standard `(0.4,0.14,0.3,1)`, entrance `(0,0,0.3,1)`, exit `(0.4,0.14,1,1)`
  - Source: [Carbon Motion overview](https://carbondesignsystem.com/elements/motion/overview/)

### Gaps
- I did not retrieve Carbon's component-specific duration choices.

## Atlassian, Shopify Polaris, Salesforce Lightning, GitHub Primer, Adobe Spectrum, Uber Base

### Takeaway
Atlassian has the most complete component-level motion token set of any system reviewed. It uses named composites per component (modal, popup, flag, panel, tab, button…), and exits are consistently shorter than enters. Primer encodes the same enter/exit asymmetry (300 ms enter / 200 ms exit) and a hard ≤300 ms rule. Polaris, SLDS and Base expose primitive duration/easing scales.

### Cited Findings
**Atlassian (`@atlaskit/tokens` 20.11.0, `atlassian-motion` theme)**
- Durations: xxshort 50ms (list hover/selected/focus), xshort 100ms (press feedback, popup dismiss), short 150ms (button hover/press, popup enter), medium 200ms (modal/flag exit), long 250ms (modal/flag enter), xlong 400ms (panels, page transitions, full-screen overlays), xxlong 600ms (onboarding), instant 0ms — [npm @atlaskit/tokens](https://www.npmjs.com/package/@atlaskit/tokens)
- Easings:
  - `out.practical` cubic-bezier(0.4, 1, 0.6, 1): "everyday enter curve… content swaps, tab changes, list reordering"
  - `out.bold` (0, 0.4, 0, 1): "arrive quickly and decelerate"
  - `inout.bold` (0.4, 0, 0, 1): for scale and repositioning
  - `in.practical` (0.6, 0, 0.8, 0.6): exits, "getting out of the way"
  - `spring` as a CSS `linear(...)` approximation that overshoots to ~1.024 (status: **experimental**)
  - Source: [npm @atlaskit/tokens](https://www.npmjs.com/package/@atlaskit/tokens)
- Component composites:
  - modal: enter 250ms bold-inout, scale 95→100%; exit 200ms practical-in, scale 100→95%
  - popup/tooltip/dropdown: enter 150ms, 8px slide + fade; exit 100ms, 4px slide + fade
  - flag (toast): enter 250ms, slide in 50% from left + fade; exit 200ms, slide out 15% + fade
  - side panel: enter 250ms, slide 100%; exit 200ms
  - blanket (scrim): fade in 250ms / out 200ms
  - button hovered/pressed: 150ms, background-color and border-color only
  - list item: hover 50ms, pressed/selected 100ms
  - tab: 150ms color/opacity; tab indicator enter 150ms (8px slide) / exit 100ms
  - toggle: 150ms incl. transform
  - Source: [npm @atlaskit/tokens](https://www.npmjs.com/package/@atlaskit/tokens)

**Shopify Polaris**
- `polaris.shopify.com/tokens/motion` now 302-redirects to `shopify.dev/docs/api/polaris` (checked 2026-11-12) — [polaris.shopify.com/tokens/motion](https://polaris.shopify.com/tokens/motion)
- Token source on the `main` branch:
  - Durations: 0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 5000 ms
  - Easings:
    - `motion-ease` (0.25,0.1,0.25,1): "A great default for any user interaction"
    - `motion-ease-in` (0.42,0,1,1): "Use sparingly"
    - `motion-ease-out` (0.19,0.91,0.38,1): "Use sparingly"
    - `motion-ease-in-out` (0.42,0,0.58,1): "good default for transitions triggered by the system"
    - `motion-linear`: for spinners
  - Keyframes: bounce, fade-in, pulse, spin, appear-above/below (translateY by space-100 + opacity)
  - Source: [polaris-tokens motion.ts](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/motion.ts)

**Salesforce Lightning (SLDS)**
- Durations: instantly 0s, immediately 0.05s, quickly 0.1s, promptly 0.2s, slowly 0.4s, paused 3.2s. SLDS 2 global hooks exist as `--slds-g-duration-{instantly|immediately|quickly|promptly|slowly|paused}` plus `--slds-g-duration-toast-short` / `-toast-medium` — [npm @salesforce-ux/design-system 2.264.3](https://www.npmjs.com/package/@salesforce-ux/design-system)

**GitHub Primer (Primitives)**
- Semantic durations:
  - micro → base.duration.100 (hover, focus ring, color shifts)
  - short → 200 (expand/collapse, toggles)
  - medium → 300 (modals, dropdowns, tooltips enter/exit)
  - long → 500 (complex/page transitions, "Use sparingly")
  - Source: [motion.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/functional/motion/motion.json5)
- Rules embedded in the tokens: "MUST keep UI interactions ≤300ms… NEVER exceed 500ms for UI interactions"; "MUST respect prefers-reduced-motion" — [motion.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/functional/motion/motion.json5)
- Base easings: linear (0,0,1,1); ease (0.25,0.1,0.25,1) for hover; easeIn (0.7,0.1,0.75,0.9) for exits; easeOut (0.3,0.8,0.6,1), "RECOMMENDED default" for enters; easeInOut (0.6,0,0.2,1) for move/morph — [easing.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/base/motion/easing.json5)
- Composite transitions: hover = micro + ease; stateChange = short + easeInOut; **enter = medium (300) + easeOut; exit = short (200) + easeIn ("Shorter than enter to feel snappy")** — [motion.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/functional/motion/motion.json5)

**Uber Base Web**
- Timing scale: 0, 100–1000 ms in 100s (with 150 and 250), plus 1500, 3000, 5000, 7000 ms
- Curves: easeDecelerate (0.22,1,0.36,1); easeAccelerate (0.64,0,0.78,0); easeAccelerateDecelerate (0.83,0,0.17,1); easeInOutCurve (0.4,0,0.2,1); easeOutCurve (.2,.8,.4,1); easeInCurve (.8,.2,.6,1); easeResponsiveAccelerate (0.11,0,0.5,0). Older quintic names are commented "use easeDecelerate"/"use easeAccelerate", which marks them as legacy aliases
- Source: [baseweb animation.ts](https://raw.githubusercontent.com/uber/baseweb/main/src/themes/shared/animation.ts)

**Adobe Spectrum**
- No animation/duration/easing tokens were found in the `src/*.json` files of `@adobe/spectrum-tokens` 15.7.0 — [npm @adobe/spectrum-tokens](https://www.npmjs.com/package/@adobe/spectrum-tokens)

### Inferences
- Primer's base durations are referenced as `base.duration.100/200/300/500`; the values are almost certainly 100/200/300/500 ms, but I did not open the base duration file.
- Polaris may now be split: the polaris.shopify.com docs site redirects to shopify.dev, which suggests the older Polaris React site and tokens are no longer the main docs. Treat the `polaris-tokens` motion values as **possibly legacy**.

### Gaps
- I did not find Spectrum's motion guidance or tokens (spectrum.adobe.com was not fetched). No SLDS 2 easing hooks were found, and no Base Web written motion principles.

## Product-led references: Linear, Vercel (Geist), Stripe, Radix/shadcn, Framer

### Takeaway
Vercel publishes explicit web-motion rules: honor reduced motion, use only compositor-friendly properties, make animations interruptible, never use `transition: all`, and set the correct transform-origin. It gives no durations or curves. Radix Themes uses one main enter curve, `cubic-bezier(0.16, 1, 0.3, 1)`.

### Cited Findings
- Vercel Web Interface Guidelines (Animations):
  - Honor `prefers-reduced-motion`
  - Prefer CSS, then the Web Animations API, then JS libraries
  - Animate `transform`/`opacity`, not width/height/top/left
  - Animate only when motion "clarifies cause and effect or adds deliberate delight"
  - Easing should fit what changes (size, distance, trigger)
  - Animations must be interruptible by user input; avoid autoplay; motion over 5 s needs pause/stop
  - Use the correct transform-origin; "Never `transition: all`"
  - Source: [vercel.com/design/guidelines](https://vercel.com/design/guidelines)
- Radix Themes 3.3.0 `styles.css`: `cubic-bezier(0.16, 1, 0.3, 1)` appears 7 times, the most common curve. Other values: spinner 800ms, segmented-control transition 100ms, progress 5s — [npm @radix-ui/themes](https://www.npmjs.com/package/@radix-ui/themes)

### Gaps
- I found no primary sources this session for Linear, Stripe, Framer or shadcn/ui motion values or principles. Not researched within the tool budget, so nothing should be claimed about them.

## Common patterns across systems

### Takeaway
The systems converge on six patterns:
- **Durations:** micro-feedback 50–150 ms; enter/exit 150–300 ms; large or full-screen transitions 300–500 ms (rarely up to 600–1000 ms).
- **Asymmetry:** exits are shorter than enters.
- **Easing:** decelerate (ease-out) to enter, accelerate (ease-in) to exit.
- **Distance-based duration:** longer duration for bigger or farther movement.
- **Properties:** animate only transform and opacity (plus color for states).
- **Springs:** springs are increasingly replacing bezier curves on native platforms.

### Cited Findings
- Exit shorter than enter:
  - Atlassian: modal 250/200, popup 150/100, flag 250/200 — [npm @atlaskit/tokens](https://www.npmjs.com/package/@atlaskit/tokens)
  - Primer: enter 300 / exit 200 — [Primer motion.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/functional/motion/motion.json5)
  - MDC container transform: 300 in / 250 out — [MDC-Android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
- Duration scales with size or traversal:
  - M3: "duration should increase as the area/traversal of an animation increases" — [MDC-Android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
  - Fluent: larger elements take longer "based on their size and distance traveled" — [Fluent 2](https://fluent2.microsoft.design/motion)
  - M3 springs: fast for small components, slow for full-screen — [MDC-Android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
- Small displacement plus fade for popovers/menus: Atlassian 8px enter / 4px exit slide with fade, and scale 95→100% for modals — [npm @atlaskit/tokens](https://www.npmjs.com/package/@atlaskit/tokens). Polaris appear-above/below uses translateY by `space-100` + opacity — [Polaris motion.ts](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/motion.ts)
- Top-level navigation fades instead of sliding: Fluent "Top level… quick fade rather than sliding large elements" — [Fluent 2](https://fluent2.microsoft.design/motion); M3 "Fade through (or Top Level)" — [MDC-Android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
- Linear easing only for continuous motion (spinners, progress): Polaris — [motion.ts](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/motion.ts); Primer — [easing.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/base/motion/easing.json5); Fluent — [Fluent 2](https://fluent2.microsoft.design/motion)
- Restraint for frequent interactions: Apple "avoid adding motion to UI interactions that occur frequently" — [HIG](https://developer.apple.com/design/human-interface-guidelines/motion.md); Carbon "If average users notice it often, reduce or remove it" — [Carbon](https://carbondesignsystem.com/elements/motion/overview/)
- Button press/hover animates color only, around 150 ms (Atlassian) — [npm @atlaskit/tokens](https://www.npmjs.com/package/@atlaskit/tokens). M3 splits a button press into a fast spatial spring for shape and a fast effects spring for color — [MDC-Android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
- Reduced motion is required by Primer, Vercel, Fluent, Carbon and Apple (sources above).

### Inferences
- Bounce is used sparingly. In M3 it applies only to spatial springs and only in the Expressive scheme. Apple recommends bounce 0 by default and bounce only for momentum gestures. Atlassian's spring curve is "experimental" and limited to small branded elements.

### Gaps
- None of the sources I reached had loading/skeleton motion values. Skeleton shimmer timing is not tokenized in any of the inspected token sets beyond Polaris `pulse` and Radix progress/spinner durations.
