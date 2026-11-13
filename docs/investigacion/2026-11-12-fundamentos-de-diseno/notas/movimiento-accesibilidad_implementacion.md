# Accesibilidad e implementación técnica del motion en UI web (ERP interno, React/Next.js) — estado a nov 2026

## 1. Accessibility requirements: WCAG 2.2 (2.3.3, 2.2.2, 2.3.1), prefers-reduced-motion, vestibular disorders, OS settings

### Takeaway
Only SC 2.2.2 (auto-playing motion longer than 5 s) and SC 2.3.1 (flashes) are Level A. SC 2.3.3, which covers motion triggered by an interaction, is AAA, but it is the guideline that applies directly to UI motion, and `prefers-reduced-motion` (technique C39) satisfies it. "Reduce" should mean swapping the motion for a fade or opacity change, keeping the same timing and the feedback, not removing it. Vestibular dysfunction is common: about 35% of US adults aged 40 and over.

### Cited Findings
**SC 2.3.3 Animation from Interactions (AAA)**
- Normative text: "Motion animation triggered by interaction can be disabled, unless the animation is essential to the functionality or the information being conveyed." — [W3C Understanding 2.3.3](https://w3c.github.io/wcag/understanding/animation-from-interactions)
- Definition of "motion animation": "addition of steps between conditions to create the illusion of movement or to give a sense of a smooth transition". **Color or opacity changes do not count as motion animation** unless they change the perceived size, shape, position or depth. — [W3C Understanding 2.3.3](https://w3c.github.io/wcag/understanding/animation-from-interactions)
- "Essential" = removing it "would fundamentally change the information or functionality", and the result cannot be achieved another way that conforms. — [W3C Understanding 2.3.3](https://w3c.github.io/wcag/understanding/animation-from-interactions)
- Intent: some users experience "distraction or nausea". Decorative motion during scrolling and parallax can trigger vestibular reactions, which "include dizziness, nausea and headaches". 2.3.3 covers animation started by an interaction. Animation that starts automatically falls under 2.2.2, and an animation can fail both. — [W3C Understanding 2.3.3](https://w3c.github.io/wcag/understanding/animation-from-interactions)
- Sufficient techniques: **C39** (CSS `prefers-reduced-motion`), **SCR40** (the same query read from JavaScript), and letting users set a preference that prevents animation. Examples given: parallax with a site-wide control to turn it off, and a page-flip transition that is disabled under reduce-motion. — [W3C Understanding 2.3.3](https://w3c.github.io/wcag/understanding/animation-from-interactions)
- Note: the version I fetched is an editor's draft (w3c.github.io). The Understanding documents are informative. — [W3C Understanding 2.3.3](https://w3c.github.io/wcag/understanding/animation-from-interactions); published version: [w3.org/WAI/WCAG21/Understanding/animation-from-interactions](https://w3.org/WAI/WCAG21/Understanding/animation-from-interactions)

**Technique C39**
- Pattern: `@media (prefers-reduced-motion: reduce) { /* disable motion */ }`. The technique also describes the inverse approach: apply motion only under `(prefers-reduced-motion: no-preference)`. Test procedure: (1) turn on reduce motion in the OS, (2) check whether the animation is essential, (3) check that it is suppressed. Either 2 or 3 must be true. — [W3C Technique C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39)

**SC 2.2.2 Pause, Stop, Hide (A)**
- Applies to moving, blinking or scrolling content that (1) starts automatically, (2) lasts more than 5 seconds and (3) is presented in parallel with other content. Such content needs a mechanism to pause, stop or hide it, unless the motion is essential. Auto-updating content has **no** 5-second exception. — [W3C Understanding 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
- A preloader that is the only content on the page is not "in parallel", so it needs no pause mechanism even past 5 s. Note 4: a preload animation can be essential if hiding progress would make users think the content is "frozen or broken". — [W3C Understanding 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)

**SC 2.3.1 Three Flashes or Below Threshold (A)**
- Nothing may flash more than 3 times in any one-second period, unless the flashes are below the general and red flash thresholds. The flashing area limit is 0.006 steradians within any 10° visual field (25% of that field). The page estimates the 10° field as a 341×256 px rectangle (87,296 CSS px²). A general flash is a pair of opposing luminance changes of ≥10%. A red flash is any pair of opposing transitions involving saturated red. Because of non-interference, all content must meet 2.3.1. — [W3C Understanding 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)

**What "reduce" should mean (Val Head)**
- Replace the triggering motion with a safer effect instead of removing it. Often it is enough to swap the animated property (e.g. transform → opacity) and **keep the same duration and easing**. Pause or remove motion only when the meaning is preserved. — [Val Head, Smashing Magazine, 8 sep 2020](https://www.smashingmagazine.com/2020/09/design-reduced-motion-sensitivities)
- Only `reduce` reflects a deliberate user choice. Treat `no-preference` as "unknown", not as consent to all motion. — [Val Head, Smashing 2020](https://www.smashingmagazine.com/2020/09/design-reduced-motion-sensitivities)
- Motion that triggers symptoms: large movements, large zooms, spinning, multi-directional motion. Parallax is "universally triggering". Lower-risk effects: color fades, opacity changes, small scale changes. When unsure, add the effect to the reduce list. — [Val Head, Smashing 2020](https://www.smashingmagazine.com/2020/09/design-reduced-motion-sensitivities)
- Reduced-motion patterns: page transitions → crossfades; decorative illustrations → static version, optionally with play on demand; GIFs and autoplay video → static alternatives; parallax → removed; smooth scroll → default anchor jump. — [Val Head, Smashing 2020](https://www.smashingmagazine.com/2020/09/design-reduced-motion-sensitivities)
- In-UI toggle: recommended for motion-heavy sites. Default it from the OS preference and persist it in localStorage. Context matters: users expect less motion on a banking site than on a storytelling site. — [Val Head, Smashing 2020](https://www.smashingmagazine.com/2020/09/design-reduced-motion-sensitivities)
- Val Head's original article "Designing Safer Web Animation For Motion Sensitivity" (A List Apart, 2015) is referenced at [zeldman.com, 8 sep 2015](https://zeldman.com/2015/09/08/designing-safer-animation/) and in her [A List Apart author archive](https://alistapart.com/author/valhead). I did not fetch the full text.

**OS settings**
- iOS/macOS: Settings > Accessibility > Display (Reduce Motion). Windows: Settings > Ease of Access > Display > Simplify and personalize Windows. Android also offers the preference. — [Val Head, Smashing 2020](https://www.smashingmagazine.com/2020/09/design-reduced-motion-sensitivities)

**Vestibular prevalence**
- Agrawal et al., *Archives of Internal Medicine* 2009;169:938–44, NHANES 2001–2004 data (n=5,086, modified Romberg test): **35.4% of US adults aged 40+ (≈69 million)** had vestibular dysfunction. By age: 18.5% in their 40s, 85% at 80+. No significant difference by sex (34% men, 35% women). — [MDedge summary of Agrawal 2009](https://mdedge.com/content/vestibular-dysfunction-common-after-age-40) (primary record: [PubMed 19468085](https://pubmed.ncbi.nlm.nih.gov/19468085), which I could not open because of a captcha)
- W3C gives no prevalence figures in the 2.3.3 Understanding document. — [W3C Understanding 2.3.3](https://w3c.github.io/wcag/understanding/animation-from-interactions)

### Inferences
- An internal ERP rarely needs AAA conformance, but following 2.3.3 costs little: a global `prefers-reduced-motion` layer plus a fade fallback. Large movements in productivity UIs (sliding drawers, zoomed modals, page transitions) are exactly what reduce-motion users disable.
- Because opacity and color are not "motion animation", a fade fallback complies with 2.3.3 and keeps state feedback (e.g. a toast appearing, a row being saved).
- Skeleton loaders and spinners (`animate-pulse`, `animate-spin`) can last more than 5 s next to other content, so they are a 2.2.2 risk. A reasonable reading is that a determinate progress indicator or a loader shown while content is unavailable fits the "essential" note. Inferred, not verified with W3C.

### Gaps
- I did not fetch the MDN `prefers-reduced-motion` page or WebAIM directly. I also did not verify the exact Android setting name ("Remove animations" in Settings > Accessibility) against a primary source.
- I could not access the full text of Val Head's 2015 A List Apart article.
- I found no data on what share of users actually turn on Reduce Motion.

## 2. Performance: transform/opacity, compositor, layout thrashing, will-change, frame budgets, FLIP, INP

### Takeaway
Animate only `transform` (translate, scale, rotate) and `opacity`. Use `will-change` sparingly, only after you have measured a problem. Use FLIP for layout changes. INP (good ≤200 ms) penalizes interactions that delay the next frame, so visual feedback must not block the main thread.

### Cited Findings
- "Use the transform and opacity CSS properties as much as possible." Avoid any property that triggers layout or paint unless it is strictly necessary. In web.dev's test, animating `top`/`left` dropped ~50% of frames versus ~1% with `transform`. — [web.dev, How to create high-performance CSS animations](https://web.dev/articles/animations-guide)
- Blur effects such as shadows are costlier to paint than simple shapes. — [web.dev animations-guide](https://web.dev/articles/animations-guide)
- `will-change` (or `translateZ(0)`) promotes an element to its own layer, but "layer creation can cause other performance issues", so it is not recommended early in optimization. Use it only on elements that are always about to change. For occasional changes, add it from JS just before the change and remove it afterwards. — [web.dev animations-guide](https://web.dev/articles/animations-guide)
- DevTools: Performance panel (Rendering in the Summary tab = layout work), FPS meter (% of frames not dropped, e.g. 99% = smooth), Paint Flashing in the Rendering tab, paint profiler. Firefox has Recalculate Style in the Waterfall view and paint flashing. — [web.dev animations-guide](https://web.dev/articles/animations-guide)
- The web.dev guide does not give an explicit frame budget (16.7 ms/60 fps). It measures by % of dropped frames. — [web.dev animations-guide](https://web.dev/articles/animations-guide)
- **FLIP** (First, Last, Invert, Play), coined by Paul Lewis (Google) in "FLIP your animations": measure with `getBoundingClientRect()` before and after the DOM change, apply an inverse transform, then animate back to `none`. It measures only twice and animates only `transform`. It works when layout (flex/grid) decides the final position. Apply translate before scale. — [Creative Bloq (David Khourshid), Create animations with the FLIP technique](https://www.creativebloq.com/features/create-animations-with-the-flip-technique)
- **INP**: Good ≤200 ms, Needs improvement 200–500 ms, Poor >500 ms (p75, mobile and desktop). Phases: input delay, processing duration, presentation delay ("until the next frame is shown"). "The next frame that the browser will paint is the earliest opportunity" to show feedback. INP replaced FID as a Core Web Vital. — [web.dev, INP](https://web.dev/articles/inp)

### Inferences
- In an ERP with dense tables, animating `height`/`width`/`top` on large lists will drop frames. Expanding rows should use FLIP, the Motion `layout` prop, View Transitions or `interpolate-size` where supported (see section 3).
- To protect INP: paint feedback immediately (a pressed state via CSS, no heavy JS), and defer expensive work (e.g. `requestAnimationFrame` or yielding). Main-thread JS animations compete with handlers; animations on transform/opacity through CSS or WAAPI can run on the compositor. The compositor point is general knowledge and was not verified in a source fetched in this round.
- Frame budget: at 60 Hz each frame lasts ~16.7 ms and at 120 Hz ~8.3 ms (simple arithmetic, 1000/Hz). Browser rendering work takes part of that budget.

### Gaps
- I did not fetch Paul Lewis's original article (aerotwist.com) or the web.dev pages on layout thrashing or forced synchronous layout. The definition of layout thrashing (interleaved DOM reads and writes) is not cited here.
- I found no official web.dev source on "animations and INP" or on the cost of `will-change` in memory and layers.

## 3. Modern web platform: CSS transitions, WAAPI, View Transitions, linear(), @starting-style, allow-discrete, scroll-driven, interpolate-size

### Takeaway
As of November 2026, same-document View Transitions, `@starting-style`/`allow-discrete`, `linear()` and scroll-driven animations (since Firefox 159, Oct 2026) are all Baseline. Cross-document View Transitions are partial in Firefox and are an Interop 2026 focus area. `interpolate-size` works only in Chromium (~74% global usage) and is suited to progressive enhancement.

### Cited Findings
**View Transitions**
- Same-document: Chrome/Edge 111, Safari 18, Firefox 144 (stable 14 Oct 2025). It thereby became Baseline Newly available. — [Chrome for Developers, What's new in view transitions (2025 update)](https://developer.chrome.com/blog/view-transitions-in-2025); [web.dev, Same-document view transitions are now Baseline](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available?authuser=17&hl=de)
- Cross-document (`@view-transition`): Chrome/Edge 126+, Safari 18.2+, Firefox **partial** in 144–163 (143 behind a flag). Global usage 89.6% (87.73% full + 1.87% partial). — [caniuse, cross-document view transitions](https://caniuse.com/cross-document-view-transitions)
- Interop 2026 includes **cross-document View Transitions** and **scroll-driven animations** as new features, plus reliability fixes for same-document View Transitions and anchor positioning. — [Mozilla Hacks, Launching Interop 2026 (feb 2026)](https://hacks.mozilla.org/2026/02/launching-interop-2026/)
- Newer features: `view-transition-class` and view transition **types** (2024). Firefox's initial implementation lacks types, so a `transitionHelper` is recommended. Nested groups: Chrome 140, not Firefox or Safari. `view-transition-name: match-element`: Chrome 137, Firefox 144, Safari 18.4, same-document only. Element-scoped transitions: Chromium only (the source is inconsistent: Chrome 140 behind a flag vs 147 in its table). `document.activeViewTransition`: Chrome 142, Firefox 147, Safari 26.2. — [Chrome, view-transitions-in-2025](https://developer.chrome.com/blog/view-transitions-in-2025)
- React: `<ViewTransition>` support arrived in `react@experimental` (Apr 2025) and moved to `react@canary` (Oct 2025, React Conf), "close to final" per Chrome. — [Chrome, view-transitions-in-2025](https://developer.chrome.com/blog/view-transitions-in-2025)
- The Chrome article does not cover reduced motion for View Transitions. — [Chrome, view-transitions-in-2025](https://developer.chrome.com/blog/view-transitions-in-2025)

**@starting-style and transition-behavior: allow-discrete**
- Baseline Newly available on 6 Aug 2024 (with Firefox 129). `@starting-style`: Chrome/Edge 117, Firefox 129, Safari 17.5. `allow-discrete`: Chrome/Edge 117, Firefox 129, Safari 17.4. — [web.dev, Now in Baseline: animating entry effects](https://web.dev/blog/baseline-entry-animations)
- Example: `dialog[open] { translate: 0 0; transition: translate .7s ease-out, display .7s ease-out allow-discrete; @starting-style { translate: 0 100vh; } }`. Put `allow-discrete` in the shorthand, because setting `transition-behavior` before the shorthand gets it ignored. Discrete properties switch at 50% of the transition. As of that date, `overlay`/`::backdrop` and exit animations were not yet Baseline. — [web.dev baseline-entry-animations](https://web.dev/blog/baseline-entry-animations)

**linear() easing (springs/bounce in CSS)**
- `linear()` interpolates linearly between points, which lets CSS approximate bounces and springs. Support: Chrome/Edge 113, Firefox 112, Safari 17.2. Tooling: the Linear easing generator (Jake Archibald and Adam Argyle) with Spring, Bounce, Elastic and Material emphasized presets, and the DevTools editor from Chrome 114. More stops give a smoother curve. — [Chrome for Developers, linear() easing](https://developer.chrome.com/docs/css-ui/css-linear-easing-function)

**Scroll-driven animations**
- Baseline Newly available in October 2026: Chrome/Edge 115, Safari 26, **Firefox 159** (on by default). They use `animation-timeline` with `scroll()`/`scroll-timeline` or `view()`/`view-timeline`, and work for both CSS and WAAPI. — [web.dev, New to the web platform in October 2026](https://web.dev/blog/web-platform-10-2026)
- WebKit: `animation-timeline` must be declared **after** the `animation` shorthand. `animation-range` defines the active segment (e.g. `0% 50%`). Recommends wrapping them in `@media not (prefers-reduced-motion)`. Parallax, zoom and depth-of-field are higher risk than a progress bar. — [WebKit blog, A guide to scroll-driven animations with just CSS (20 jun 2025)](https://www.webkit.org/blog/17101/a-guide-to-scroll-driven-animations-with-just-css/)

**interpolate-size / calc-size (animating to height:auto)**
- `interpolate-size: allow-keywords`: Chrome/Edge 129+. **Not supported** in Safari (through 27.3) or Firefox (through 163). Global usage ~73.9%. — [caniuse, interpolate-size](https://caniuse.com/mdn-css_properties_interpolate-size_allow-keywords)
- Guide: [Chrome, Animate to height: auto](https://developer.chrome.com/docs/css-ui/animate-to-height-auto); progressive-enhancement framing: [Piccalil](https://piccalil.li/blog/the-interpolate-size-property-is-a-great-example-of-progressive-enhancement/) (not fetched)

### Inferences
- For a Next.js ERP in 2026, CSS can cover most cases without a library: native entry/exit for `<dialog>`/popover with `@starting-style` + `allow-discrete`, spring-like easings with `linear()`, and route or list transitions with same-document View Transitions (Baseline).
- Cross-document View Transitions matter little for a Next.js SPA, which navigates client-side as a same-document app. They only matter for MPA sections.
- `interpolate-size` should only be a progressive enhancement (accordions). In Safari and Firefox the element should simply open instantly, with no visual break.
- View Transitions do not respect reduced motion automatically according to the sources consulted. Wrap `::view-transition-*` pseudo-elements in a `prefers-reduced-motion` query, or skip `startViewTransition` (inferred, not verified in an official source).

### Gaps
- I did not verify the exact support status of WAAPI (long Baseline) or of exit animations to `display:none`/`overlay` in 2026.
- I did not get details of what Firefox's "partial" support for cross-document VT covers.
- I did not fetch MDN pages on CSS transitions or WAAPI.

## 4. Libraries: Motion, React Spring, GSAP, Lottie/Rive, Radix/shadcn, Tailwind

### Takeaway
Motion (formerly Framer Motion) offers a global reduced-motion switch (`<MotionConfig reducedMotion="user">`) that disables transforms and layout animations but keeps opacity and color, which matches WCAG 2.3.3. GSAP has been 100% free, plugins included, since April/May 2025. Radix (the base of shadcn/ui) exposes `data-state` for animating with CSS and delays unmount until the animation ends. Tailwind provides `motion-safe:`/`motion-reduce:` variants.

### Cited Findings
- **Motion**: `<MotionConfig reducedMotion="user">` respects the OS setting. All `motion` components disable **transform and layout animations**, while opacity and backgroundColor keep animating. `"always"`/`"never"` override the system setting (e.g. from a preference saved in the user profile). `useReducedMotion()` returns a boolean for custom logic, e.g. swapping `x: "-100%"` for `opacity: 0`, disabling `autoPlay` on video, or setting the parallax `y` to 0. — [motion.dev, React accessibility](https://motion.dev/docs/react-accessibility); [motion.dev, MotionConfig](https://motion.dev/docs/react-motion-config)
- **GSAP**: Webflow made GSAP "100% free for all users", including the previously paid Club plugins (Flip, ScrollTrigger and SplitText are named). The standard license was expanded to cover commercial use. SplitText was rewritten (−50% size, 14 new features, screen-reader accessibility). Page updated 30 Apr 2025. — [Webflow blog, Webflow makes GSAP 100% free](https://webflow.com/blog/gsap-becomes-free); version 3.13: [gsap.com/blog/3-13](https://gsap.com/blog/3-13/)
- **Radix Primitives**: components expose `data-state="open|closed"` for CSS keyframes (e.g. fadeIn 300 ms ease-out / fadeOut 300 ms ease-in). Radix suspends unmount until the CSS animation ends. With JS libraries, `forceMount` hands mount/unmount control to the library (the guide's example uses React Spring `useTransition` + `asChild`). The guide does not cover reduced motion. — [Radix, Animation guide](https://www.radix-ui.com/primitives/docs/guides/animation)
- **Tailwind (v4)**: built-in `animate-spin` (1s linear infinite), `animate-ping`, `animate-pulse` (2s), `animate-bounce`, and `animate-none`. Custom animations are defined with `@theme { --animate-wiggle: …; @keyframes wiggle {…} }`. `motion-safe:`/`motion-reduce:` variants (e.g. `motion-safe:animate-spin`). — [Tailwind CSS docs, animation](https://tailwindcss.com/docs/animation)

### Inferences
- Recommended stack for a Next.js ERP with shadcn/ui: CSS/Tailwind on Radix `data-state` for overlays (dialog, popover, dropdown, accordion), `motion-safe:`/`motion-reduce:` for loaders, and Motion only where layout animations (reordering, expanding rows) or exit control (`AnimatePresence`) are needed. Wrap the app root in `<MotionConfig reducedMotion="user">`.
- GSAP being free makes it viable, but it adds weight and an imperative model that fits less well with React and Radix in a productivity UI. It makes more sense for marketing pages.

### Gaps
- I did not fetch Motion docs on `layout`/`layoutId`, `AnimatePresence`, springs (stiffness/damping vs duration/bounce), or bundle sizes.
- I did not research React Spring, Lottie or Rive (support for reduced motion, runtime weight). There are no sources in these notes.
- I did not verify official shadcn/ui documentation (the `tailwindcss-animate`/`tw-animate-css` plugin) or Radix CSS variables such as `--radix-accordion-content-height`.
- I did not verify GSAP's reduced-motion pattern (`gsap.matchMedia()`) in an official source.

## 5. Motion tokens in design systems (DTCG format, naming)

### Takeaway
The DTCG format reached its first stable version (2025.10, 28 Oct 2025) with `duration` types (`{value, unit: "ms"|"s"}`), `cubicBezier` (4 numbers, x values in [0,1]), and a composite `transition` type (duration + delay + timingFunction). IBM Carbon is a good enterprise reference: 6 duration steps (70–700 ms) and "productive" vs "expressive" easings.

### Cited Findings
- Design Tokens Format Module 2025.10, a Final Community Group Report of 28 Oct 2025, "considered stable". It is not a W3C Standard and not on the Standards Track. — [DTCG Format Module 2025.10](https://w3c.github.io/cg-reports/design-tokens/CG-FINAL-format-20251028/); [W3C CG announcement](https://w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)
- `duration`: `"$type": "duration", "$value": { "value": 150, "unit": "ms" }`. Only `ms` and `s` are allowed. — [DTCG 2025.10](https://w3c.github.io/cg-reports/design-tokens/CG-FINAL-format-20251028/)
- `cubicBezier`: an array `[P1x, P1y, P2x, P2y]`. The x values must be in [0,1]; the y values can be any real number, which allows overshoot. — [DTCG 2025.10](https://w3c.github.io/cg-reports/design-tokens/CG-FINAL-format-20251028/)
- Composite `transition`: `{ duration, delay, timingFunction }`, each a value or a reference to a token. Example: `"transition-fade": { "$type": "transition", "$value": { "duration": {"value":200,"unit":"ms"}, "delay": {"value":0,"unit":"ms"}, "timingFunction": [0.25,0.1,0.25,1] } }`. — [DTCG 2025.10](https://w3c.github.io/cg-reports/design-tokens/CG-FINAL-format-20251028/)
- Rules: names must not start with `$` or contain `{`, `}` or `.`, and they are case-sensitive. An object with `$value` is a token; without it, it is a group. The type comes from its own `$type`, the nearest parent group or the alias target. Tools **must not** infer the type from the value. Aliases use `{group.token}`, and JSON Pointer `$ref` can target properties. — [DTCG 2025.10](https://w3c.github.io/cg-reports/design-tokens/CG-FINAL-format-20251028/)
- **IBM Carbon**, duration tokens: `duration-fast-01` 70 ms (buttons, toggles), `fast-02` 110 ms (fades), `moderate-01` 150 ms (small expansions), `moderate-02` 240 ms (expansions, toasts), `slow-01` 400 ms (large expansions, important notifications), `slow-02` 700 ms (background dimming). — [Carbon, Motion overview](https://carbondesignsystem.com/elements/motion/overview/)
- **Carbon**, easings: Productive standard `cubic-bezier(0.2,0,0.38,0.9)`, entrance `(0,0,0.38,0.9)`, exit `(0.2,0,1,0.9)`; Expressive standard `(0.4,0.14,0.3,1)`, entrance `(0,0,0.3,1)`, exit `(0.4,0.14,1,1)`. Use standard when the element stays visible and exit when it leaves permanently. — [Carbon, Motion overview](https://carbondesignsystem.com/elements/motion/overview/)
- **Carbon**, "productive" motion for tasks: button states, dropdowns, revealing information, data tables and visualizations. Micro-interactions should use ease-out at ~90–120 ms with immediate feedback. "If users notice the motion often, consider reducing or removing it." — [Carbon, Motion overview](https://carbondesignsystem.com/elements/motion/overview/)

### Inferences
- Suggested ERP structure: primitive tokens `motion.duration.{fast-01…slow-02}` and `motion.easing.{standard|entrance|exit}.{productive|expressive}` (`cubicBezier`), plus semantic `transition` tokens (`motion.transition.overlay-enter`, `…toast-enter`) that alias the primitives. Exported to CSS variables, these feed Tailwind `@theme` and Motion `transition`.
- A reduced-motion variant of the tokens (e.g. the same durations, with transform swapped for opacity in the component) is more consistent than forcing durations to 0 globally.
- DTCG has no spring or `linear()` type. Springs would have to be documented as non-standard tokens (with `$extensions`) or approximated with `cubicBezier`. Inferred from the types listed; I did not exhaustively check that no such type exists.

### Gaps
- I did not fetch Material 3's motion tokens (duration short/medium/long, emphasized easing) or any other system for comparison.
- I did not verify tool support for DTCG 2025.10 (Style Dictionary v4/v5, Tokens Studio, Terrazzo); [Terrazzo DTCG guide](https://terrazzo.app/docs/guides/dtcg/) was not fetched.

## 6. Motion spec and design–engineering handoff practices

### Takeaway
I found little direct material. Usable references are Carbon (a token per usage case, and the IBM motion package as the single source) and DTCG `transition` tokens as a shared contract between design and code.

### Cited Findings
- Carbon recommends consuming easings through its motion package (`motion(standard, productive)`), which receives future updates, rather than copying values by hand. It offers a Motion Generator for custom durations. — [Carbon, Motion overview](https://carbondesignsystem.com/elements/motion/overview/)
- The composite `transition` type lets you bundle duration, delay and timingFunction into one referenceable token, which can serve as a semantic unit for a spec. — [DTCG 2025.10](https://w3c.github.io/cg-reports/design-tokens/CG-FINAL-format-20251028/)
- Val Head: when designing, document the reduced-motion alternative for each pattern (crossfade instead of zoom, static image instead of animation). — [Val Head, Smashing 2020](https://www.smashingmagazine.com/2020/09/design-reduced-motion-sensitivities)

### Inferences
- A minimal motion spec per component could include: trigger (user interaction or automatic), properties animated, `transition` token, behavior under reduce (replacement), whether it is "essential", and an interruption policy. These fields come from the requirements in sections 1–5, not from a dedicated source.

### Gaps
- I found no reliable sources (Smashing, CSS-Tricks, Google, Material) specific to motion handoff (spec sheets, Figma Smart Animate vs code, Lottie/Rive as handoff, motion annotations). This area still needs research.
