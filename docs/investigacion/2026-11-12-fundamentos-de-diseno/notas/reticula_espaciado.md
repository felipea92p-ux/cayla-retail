# Retícula, espaciado, tamaños y densidad para aplicaciones enterprise densas en datos (ERP interno, escritorio + teléfono), a 2026

Legend: **[STANDARD]** = normative standard (W3C) · **[PRACTICE]** = design-system convention (token files / official docs) · **[EVIDENCE]** = empirical study (peer-reviewed or published experiment).
Token values below were read directly from the source files on GitHub `main` branches (fetched 2026-11-12) unless marked otherwise. Several JS-rendered doc sites (m3.material.io, experience.sap.com current, unpkg/npm) returned errors through the proxy; GitHub raw sources were used instead.

## 1. Spacing systems: 4pt/8pt base, exact token scales, inside-vs-between rule

### Takeaway
Every major system has converged on a 4px base unit with 8px as the main step. Small steps of 2px and 6px (sometimes 10px) exist for dense components, and the scale gets sparser above 24–32px. A 4px-base scale with these stops, 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, covers what Carbon, Atlassian, Polaris, Primer, Fluent 2, Radix and Tailwind all offer.

### Cited Findings
- **[PRACTICE] Carbon (IBM)**: `spacing-01`..`spacing-13` = 0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 10 rem. At 16px root that is **2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 160 px**. Fluid spacing tokens are 0, 2, 5, 10 (vw-based). There are also `container-01..05` = 24, 32, 40, 48, 64 px and deprecated `layout-01..07` = 16, 24, 32, 48, 64, 96, 160 px — [Carbon layout.tokens.json](https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/layout/tokens/layout.tokens.json)
- **[PRACTICE] Carbon** defines `miniUnit = 8` and `baseFontSize = 16`, so the "2x grid" is built on 8px mini-units — [Carbon packages/layout/src/index.ts](https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/layout/src/index.ts)
- **[PRACTICE] Atlassian**: the base unit is 8px = `space.100`. Tokens: `space.0` 0, `space.025` 2, `space.050` 4, `space.075` 6, `space.100` 8, `space.150` 12, `space.200` 16, `space.250` 20, `space.300` 24, `space.400` 32, `space.500` 40, `space.600` 48, `space.800` 64, `space.1000` 80 px. Negative tokens run from `space.negative.025` (−2) to `space.negative.400` (−32), and the Bleed primitive is recommended over negative tokens. — [Atlassian Design: Spacing](https://atlassian.design/foundations/spacing)
- **[PRACTICE] Atlassian usage bands**: 0–8px (`space.0`–`space.100`) for compact UI, such as icon-to-text gaps, badge and icon-button padding, button-group gaps, input padding, and the gap between card title and description. 12–24px (`space.150`–`space.300`) for larger, less dense UI, such as button padding and vertical spacing in cards. 32–80px for page-level layout. Atlassian says its spacing system "lays a foundation for customisable UI density in the future" but does not define density modes yet. — [Atlassian Design: Spacing](https://atlassian.design/foundations/spacing)
- **[PRACTICE] Shopify Polaris**: `space-0`, `-025`, `-050`, `-100`, `-150`, `-200`, `-300`, `-400`, `-500`, `-600`, `-800`, `-1000`, `-1200`, `-1600`, `-2000`, `-2400`, `-2800`, `-3200` map to the size scale **0, 1, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 112, 128 px**. The suffix ×0.04 gives px (100 → 4px). There are semantic aliases: `space-table-cell-padding` = space-150 (**6px**), `space-card-padding` = space-400 (16px), `space-card-gap` = space-400 (16px), `space-button-group-gap` = space-200 (8px). — [Polaris space.ts](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/space.ts); [Polaris size.ts](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/size.ts)
- **[PRACTICE] GitHub Primer** base sizes are 2, 4, 6, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 64, 80, 96, 112, 128 px, with negative mirrors from −2 to −48. — [Primer base/size/size.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/base/size/size.json5)
- **[PRACTICE] Microsoft Fluent 2** (web tokens): `none` 0, `xxs` 2, `xs` 4, `sNudge` 6, `s` 8, `mNudge` 10, `m` 12, `l` 16, `xl` 20, `xxl` 24, `xxxl` 32 px. The scale is exposed separately as `spacingHorizontal*` and `spacingVertical*`. — [Fluent UI tokens spacings.ts](https://raw.githubusercontent.com/microsoft/fluentui/master/packages/tokens/src/global/spacings.ts)
- **[PRACTICE] Radix Themes**: `--space-1..9` = 4, 8, 12, 16, 24, 32, 40, 48, 64 px, each multiplied by `var(--scaling)`. Scaling is a global density/zoom factor. — [Radix Themes space.css](https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/styles/tokens/space.css)
- **[PRACTICE] Tailwind CSS v4** uses a single `--spacing: 0.25rem` (4px). Utilities are multiples of it (`p-3` = 12px). — [tailwindcss theme.css](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/main/packages/tailwindcss/theme.css)
- **[PRACTICE] Material (MDC Web)**: the density interval is **4px**. Component height = base height + 4px × density scale, for example "36px + 4px * (-3) => 24px" for a button. — [MDC density README](https://raw.githubusercontent.com/material-components/material-components-web/master/packages/mdc-density/README.md)
- **[PRACTICE] Inside vs between**: Atlassian treats padding inside a container (scaling with component size, from badge/table-cell values to button values) separately from gaps between elements (small for tightly related items, larger for less dense groups). Its stated layout guidance: "group related items closely, use spacing to rank importance, keep consistent rhythm in lists". — [Atlassian Design: Spacing](https://atlassian.design/foundations/spacing)
- **[PRACTICE] Primer** control groups: "Match gap size to control size (small controls use small gaps). Condensed for tight groupings, spacious for separated actions." Its Stack layout gap/padding tiers use 8, 16 and 24 px. — [Primer functional/size/size.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/functional/size/size.json5)

### Inferences
- Off-grid steps sit below 12px. Polaris has 6px, Atlassian and Primer 6px, Fluent 6px and 10px. Dense UIs need sub-8px control inside components, such as table-cell padding (Polaris 6px) and icon-text gaps. Above 24px every system moves in 8px or larger jumps.
- The "internal spacing ≤ external spacing" rule (Gestalt proximity) is how every system documents its scale: component padding comes from small and medium tokens, gaps between groups from medium and large tokens. None of the fetched sources states it as a formal numeric rule.
- Radix's `--scaling` multiplier and Material's −4px-per-step density are two simple ways to implement density on top of one spacing scale.

### Gaps
- Material 3 official spacing tokens (m3.material.io is JS-rendered and returned an error). M3 is commonly described as using 4dp increments, but this was not verified in this session.
- Baseline grid: no fetched source specified a typographic baseline grid (e.g., 4px baseline) as a current requirement. Carbon's 8px mini-unit is the closest.
- No primary source defining "internal ≤ external" as a formal rule. It is usually attributed to the Gestalt proximity principle and to Refactoring UI, neither of which was fetched.

## 2. Grid, breakpoints, layout regions and app shell

### Takeaway
Breakpoints differ between systems, but the families are stable. Compact/phone is under 600 (Material) or 640–672 (Tailwind/Carbon). Tablet/medium runs about 600–840 or 768–1056. Desktop starts at about 1024–1056, and wide at about 1280–1584. Carbon's 4/8/16-column grid on an 8px mini-unit fits a data-dense ERP well.

### Cited Findings
- **[PRACTICE] Carbon 2x Grid breakpoints**:

  | Breakpoint | Min width | Columns | Margin |
  |---|---|---|---|
  | sm | 320 | 4 | 0 |
  | md | 672 | 8 | 16px |
  | lg | 1056 | 16 | 16px |
  | xlg | 1312 | 16 | 16px |
  | max | 1584 | 16 | 24px |

  Source: [Carbon layout/src/index.ts](https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/layout/src/index.ts)
- **[PRACTICE] Material / Android window size classes (width, dp)**: Compact < 600, Medium ≥ 600, Expanded ≥ 840, Large ≥ 1200, Extra-large ≥ 1600. Height: Medium ≥ 480, Expanded ≥ 900. Large and Extra-large were added in `BREAKPOINTS_V2`. — [androidx WindowSizeClass.kt](https://raw.githubusercontent.com/androidx/androidx/androidx-main/window/window-core/src/commonMain/kotlin/androidx/window/core/layout/WindowSizeClass.kt)
- **[PRACTICE] Tailwind v4 default breakpoints**: sm 40rem (640), md 48rem (768), lg 64rem (1024), xl 80rem (1280), 2xl 96rem (1536). Container widths: 3xs 16rem (256), 2xs 18rem, xs 20rem, sm 24rem, md 28rem, lg 32rem, xl 36rem, 2xl 42rem, 3xl 48rem, 4xl 56rem, 5xl 64rem, 6xl 72rem, 7xl 80rem (1280). — [tailwindcss theme.css](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/main/packages/tailwindcss/theme.css)
- **[PRACTICE] Primer breakpoints**: xsmall 320, small 544, medium 768, large 1012, xlarge 1280, xxlarge 1400. Viewport ranges: `narrow` < 768, `regular` ≥ 768, `wide` ≥ 1400, plus a `narrowLandscape` case. — [Primer breakpoints.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/functional/size/breakpoints.json5); [Primer viewport.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/functional/size/viewport.json5)
- **[PRACTICE] Polaris breakpoints**: xs 0, sm 490, md 768, lg 1040, xl 1440 px. Polaris notes these are "Commonly used for sizing containers (e.g. max-width)". — [Polaris breakpoints.ts](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/breakpoints.ts)
- **[PRACTICE] Primer overlay widths** (dialogs and menus): xsmall 192, small 320, medium 480, large 640, xlarge 960 px. "xsmall/small for menus and tooltips, medium for dialogs, large/xlarge for complex modals." — [Primer functional/size/size.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/functional/size/size.json5)

### Inferences
- A practical ERP set is: phone < 640, tablet 640–1023, desktop ≥ 1024, wide ≥ 1280, optionally ultra ≥ 1536. This is Tailwind's default, and it sits close to Carbon (672/1056/1312) and Material (600/840/1200).
- Margins of 16px at phone/tablet/desktop and 24px at ultra-wide (Carbon) are a safe default for page gutters.

### Gaps
- Exact Material 3 layout-region guidance (pane counts per class, 16/24dp margins, side-sheet widths) could not be fetched from m3.material.io.
- App-shell dimensions (sidebar width, header height) were not found in any fetched token file. Carbon UI Shell (48px header) and common sidebar widths of 240–256px are widely cited but were not verified this session.

## 3. Density modes and data-table row heights

### Takeaway
Enterprise systems offer 2–5 densities on a 4–8px step. The common row and control heights are **24 / 32 / 40 / 48 / 64 px**. Compact (32px) suits mouse and keyboard on desktop. A touch area of about 44px is required for touch, which is why SAP enforces cozy on phones and tablets. Do not mix densities within one page.

### Cited Findings
- **[PRACTICE] Carbon DataTable row heights** (`block-size` on `tr`):

  | Size | Row height |
  |---|---|
  | xs | 24px |
  | sm | 32px |
  | md | 40px |
  | default (lg) | 48px (`$spacing-09` = 3rem) |
  | xl | 64px |

  A `--zebra` modifier exists. — [Carbon _data-table.scss](https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/styles/scss/components/data-table/_data-table.scss)
- **[PRACTICE] Carbon component size tokens**: size-xs 24, sm 32, md 40, lg 48, xl 64, 2xl 80 px. Icon sizes are 16 and 20 px. — [Carbon layout.tokens.json](https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/layout/tokens/layout.tokens.json)
- **[PRACTICE] Primer control heights**: xsmall 24, small 28, medium 32, large 40, xlarge 48 px. "xsmall/small for dense UIs, medium for standard forms, large/xlarge for prominent CTAs. Use minTarget values to ensure touch accessibility on coarse pointer devices." — [Primer functional/size/size.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/functional/size/size.json5)
- **[PRACTICE] SAP Fiori**: cozy "displays components with dimensions large enough for users to interact using their fingertips", with a default touch area of **2.75rem (44px)**. Compact is for mouse and keyboard: rows and toolbars "can use sizes of 2rem (32px)", and font size stays the same. In the launchpad, phone and tablet get **cozy enforced**. Desktop defaults to compact unless the user prefers cozy. Hybrid devices default to cozy. Rule: never combine cozy and compact in the same hierarchy or page; set density at app level. — [SAP Fiori Design Web: Content Density (Cozy and Compact)](https://www.sap.com/design-system/fiori-design-web/v1-136/foundations/visual/cozy-compact)
- **[PRACTICE] Material (MDC Web)**: "Material Design uses low-density space by default but offers high-density space when it improves the user experience… List, tables, and long forms are components that benefit from increased density." Only negative density scales are allowed, each step −4px, and the supported range is per component. — [MDC density README](https://raw.githubusercontent.com/material-components/material-components-web/master/packages/mdc-density/README.md)
- **[PRACTICE] Radix Themes**: global density is done with `--scaling`, which multiplies space and radius tokens. — [Radix Themes space.css](https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/styles/tokens/space.css)
- **[PRACTICE] Polaris** fixes data-table cell padding at 6px (`space-table-cell-padding` = space-150), which makes it a dense default. — [Polaris space.ts](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/space.ts)
- **[STANDARD] WCAG Understanding 2.5.8** notes "users with different disabilities need different control sizes, so offering a larger active area or a density setting can help." — [W3C Understanding SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

### Inferences
- For the ERP (desktop in stores and workshop, plus phones):
  - Desktop tables: default 40px rows, compact 32px for expert or bulk views.
  - Phone: rows and controls at 44–48px, following SAP's cozy enforcement on touch.
  - Density belongs at app or page level, never mixed within a page.
- Density switching can key off `@media (pointer: coarse)`, the same signal Primer's `minTarget.coarse` uses, rather than viewport width alone.

### Gaps
- No peer-reviewed study comparing expert productivity in compact vs comfortable density was found in this session. The claim that density helps expert users rests on design-system guidance (Material, SAP), not cited experiments.
- Material 3 data-table row heights (often cited as 52px rows and 56px headers in Material 2) were not verified. The MDC data-table README fetched does not state them.
- Atlassian does not define density modes as of the fetched page.

## 4. Target sizes: WCAG, platform minimums, Fitts and touch research

### Takeaway
The legal and accessibility floor is **24×24 CSS px** (WCAG 2.2 SC 2.5.8, AA), or smaller targets with 24px spacing. The touch-comfort target is **44×44** (WCAG 2.5.5 Enhanced, SAP cozy, Primer coarse `minTarget`). Research on one-handed thumb use (Parhi et al. 2006) recommends about 9.2–9.6 mm. Mouse-only desktop controls can be 24–32px. Touch controls should be at least 44px.

### Cited Findings
- **[STANDARD] WCAG 2.2 SC 2.5.8 Target Size (Minimum), Level AA**: "The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when:"
  - **Spacing**: an undersized target passes if a 24px-diameter circle centered on its bounding box does not intersect another target or another undersized target's circle.
  - **Equivalent**: the function is available through another control on the same page that meets the criterion.
  - **Inline**: the target is in a sentence or constrained by line-height.
  - **User agent control**: the size is determined by the user agent and not modified by the author.
  - **Essential**: the presentation is essential or legally required.

  Source: [W3C Understanding SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- **[STANDARD] Rationale for 24px**: the Working Group reviewed research that "mostly focused on touchscreens and suggested larger sizes". Because the SC covers all pointer inputs, it chose 24×24 "after reviewing the average target size on high-traffic sites". Authors are encouraged to aim for **2.5.5 Target Size (Enhanced), 44×44 CSS px** for important controls. — [W3C Understanding SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). The Understanding page fetched did not state 2.5.5's level. It is AAA in WCAG 2.1 and 2.2, but that was not re-verified this session.
- **[PRACTICE] Primer** `control.minTarget`: **fine = 16px**, **coarse = 44px**. — [Primer functional/size/size.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/functional/size/size.json5)
- **[PRACTICE] SAP Fiori** cozy touch area is 2.75rem (44px). — [SAP Fiori Cozy/Compact](https://www.sap.com/design-system/fiori-design-web/v1-136/foundations/visual/cozy-compact)
- **[EVIDENCE] Parhi, Karlson & Bederson (MobileHCI 2006)**, one-handed thumb use on small touchscreens, in two phases: discrete tasks (buttons, checkboxes) and serial tasks (text entry). Recommended target sizes are **9.2 mm for discrete** and **9.6 mm for serial** tasks. Speed improved with size, and there were "no significant differences in error rate" across the tested sizes. Recommendations also drew on hit variability and subjective ratings. — [Microsoft Research: Target Size Study for One-Handed Thumb Use on Small Touchscreen Devices](https://www.microsoft.com/en-us/research/?p=155150); DOI [10.1145/1152215.1152260](https://dx.doi.org/10.1145/1152215.1152260)

### Inferences
- 9.2–9.6 mm is roughly 44–48 CSS px on typical phones. This matches 44 (Apple, WCAG AAA, SAP, Primer) and 48 (Material).
- A 32px compact desktop row passes 2.5.8 AA. A 24px xs row only passes if the interactive targets in it meet the 24px spacing test.

### Gaps
- **Apple HIG 44×44 pt** and **Material 48×48 dp** minimum touch targets are widely known, but their JS-rendered pages were not fetched this session. They are unverified here.
- **Fitts (1954)** and **MacKenzie (1992)** were not fetched. Fitts's law (movement time grows with log2 of distance/width + 1, Shannon formulation per MacKenzie) is canonical but uncited here. Commonly referenced: Fitts, P. M. (1954), *J. Exp. Psychology* 47(6), DOI 10.1037/h0055392; MacKenzie, I. S. (1992), *Human-Computer Interaction* 7(1), DOI 10.1207/s15327051hci0701_3. The DOIs are from memory and not verified.
- **Hoober (2013, "How Do Users Really Hold Mobile Devices?")** was not fetched.
- The Parhi participant count was not in the fetched abstract.

## 5. Visual hierarchy, Gestalt, scanning patterns, Hick's law, cognitive load

### Takeaway
NN/g eyetracking shows the F-pattern is a *failure* mode. It appears when a page offers no strong cues, and it makes users miss content on the right. In dense ERP screens, clear headings, grouping, left-aligned key data and strong signifiers produce a more efficient "layer-cake" or "spotted" scan.

### Cited Findings
- **[EVIDENCE] NN/g F-pattern** (2006, re-confirmed 2017 on desktop and mobile, mirrored for RTL Arabic): a top horizontal scan, a shorter second horizontal scan, then a vertical scan down the left. "The F-pattern is the default pattern when there are no strong cues to attract the eyes towards meaningful information." It happens with dense unformatted text, efficiency-seeking users and low motivation, and it is "bad for users and businesses" because right-side content is missed. — [NN/g: F-Shaped Pattern of Reading on the Web](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/)
- **[EVIDENCE] Other NN/g scan patterns**:
  - **Layer-cake**: headings are scanned and body text skipped.
  - **Spotted**: users hunt for links, numbers or specific words.
  - **Marking**: the eye stays fixed while the page scrolls, more common on mobile.
  - **Bypassing**: users skip repeated first words of list items.
  - **Commitment**: highly motivated users read nearly everything.

  NN/g's advice: "Assume that most users will be scanning". Use informative-first headings, visual grouping, bolded key terms and descriptive link text. — [NN/g: F-Shaped Pattern](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/)

### Inferences
- For ERP tables and forms:
  - Put identifiers and status in the leftmost columns.
  - Start labels with their distinguishing word (the bypassing pattern).
  - Use section headings to enable layer-cake scanning.
  - Right-aligned numbers stay scannable because users look for numbers (spotted pattern).
- Gestalt proximity and common region can be built from the spacing scale alone, without boxes. Tight internal gaps (4–8px) against larger group gaps (16–24px) do the work.

### Gaps
- No primary sources were fetched for Gestalt principles (proximity, similarity, common region, alignment), Hick's law (Hick 1952 / Hyman 1953), the Z-pattern, or cognitive-load studies in dense UIs. The tool-call budget was exhausted. Treat these as theory not cited in this note.

## 6. Depth without shadows, radius conventions, flat-design affordance

### Takeaway
Flat systems signal depth with **layer background tints and borders** instead of shadows. Carbon's base → layer-01 → 02 → 03 model, with paired field and border tokens per layer, is the clearest example. Radius scales cluster at 2/4/6/8/12/16 px, and Carbon now ships 0–24 px radius tokens. NN/g evidence shows *weak signifiers* (not flatness per se) cost about 22% more time and 25% more fixations. Flat design works when density is low and targets are high-contrast. Dense ERP screens therefore need explicit signifiers: borders, a contrasting link or button color, and visible input boxes.

### Cited Findings
- **[PRACTICE] Carbon layering model**: "There are four layers within a theme: base layer, layer 01, layer 02, and layer 03". Each stacks on the one below.
  - "Any token with an -01 ending belongs to the 01 layering set". Base-set tokens are unnumbered background tokens.
  - A field sits on the layer beneath it: a field on layer-02 uses field-03, paired with border-strong-03.
  - Contextual tokens "keep the same name no matter which layer it sits on", with values set by nesting in `<Layer>`, up to 3 levels.

  The fetched page does not discuss shadows. — [Carbon: Color usage](https://carbondesignsystem.com/elements/color/usage)
- **[PRACTICE] Radius scales**:
  - **Carbon**: `border-radius-00/02/04/08/16/24/max` = 0, 2, 4, 8, 16, 24 px, 999999 px. These are a recent addition: Carbon was historically square-cornered. — [Carbon layout.tokens.json](https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/layout/tokens/layout.tokens.json)
  - **Polaris**: border-radius 0, 2, 4, 6, 8, 12, 16, 20, 30 px, full 9999. Border widths 0, 0.66 (`0165`), 1, 2, 4 px. — [Polaris border.ts](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/border.ts); [Polaris size.ts](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/size.ts)
  - **Fluent 2**: None 0, Small 2, Medium 4, Large 6, XLarge 8, 2XLarge 12, 3XLarge 16, 4XLarge 24, 5XLarge 32, 6XLarge 40, Circular 10000 px. — [Fluent borderRadius.ts](https://raw.githubusercontent.com/microsoft/fluentui/master/packages/tokens/src/global/borderRadius.ts)
  - **Radix**: radius-1..6 = 3, 4, 6, 8, 12, 16 px × scaling × `--radius-factor`. The factor is `none` = 0, `small` = 0.75, `medium` = 1, `large` = 1.5, `full` = 1.5 with pill `--radius-full` 9999px. — [Radix radius.css](https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/styles/tokens/radius.css)
  - **Tailwind v4**: radius xs 2, sm 4, md 6, lg 8, xl 12, 2xl 16, 3xl 24, 4xl 32 px. — [tailwindcss theme.css](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/main/packages/tailwindcss/theme.css)
- **[EVIDENCE] NN/g, "Flat UI Elements Attract Less Attention and Cause Uncertainty" (2017)**:
  - Method: 9 live sites across 6 domains, each with a strong-signifier and a weak-signifier version (18 designs). Between-subjects desktop eyetracking with 71 users on findability tasks.
  - Weak signifiers took **22% longer** and produced **25% more fixations** (p < 0.05). 6 of 9 pairs showed different heatmaps, and no pair favored the weak version.
  - Brilliant Earth case: **86% (25/29)** went straight from the heading to the target with strong signifiers vs **50% (12/24)** with weak ones (p < 0.005).
  - Flat design worked when pages had low information density, a traditional layout and high-contrast targets. A contrasting inline link color without underline seemed sufficient.
  - The authors attribute the cost to "click uncertainty". Only the search phase was measured, and misclicks were not.

  Source: [NN/g: Flat UI Elements Attract Less Attention](https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/)

### Inferences
- A zero-shadow, low-radius ERP is not inherently harmful. The NN/g penalty attaches to weak *signifiers*. The ERP is high-density, which is exactly where NN/g found flat cost the most, so clickable elements need:
  - distinct color or contrast,
  - visible borders on inputs,
  - a consistent button shape,
  - hover and focus states.
- Elevation without shadows can be built from: background tint steps (Carbon layers), 1px subtle borders, and scrims for modal overlays.
- On radius, 4–8px for controls and cards is the modal choice across Carbon, Polaris, Fluent, Radix and Tailwind. 0px is a deliberate brand choice. Mixing radii by hierarchy is common: smaller on inner elements, larger on containers.

### Gaps
- Vercel Geist and Linear depth conventions were not fetched.
- Carbon's per-theme layer hex values could not be fetched (source file paths moved, 404).
- No empirical study on the *perceived meaning* of 0 vs 4 vs 8px radius was found in this session. Claims about friendliness vs seriousness of rounding are practitioner opinion only.

## 7. Data tables: striping, alignment, headers, widths

### Takeaway
Zebra striping has **no proven accuracy or speed benefit** (Enders, 244 participants), but it causes no harm and many users prefer it, so it is a reasonable *optional* setting. Row-height density (24–64px) and cell padding (about 6–16px) matter more and are standardized in Carbon and Polaris.

### Cited Findings
- **[EVIDENCE] Enders, "Zebra Striping: Does it Really Help?" (A List Apart)**:
  - Method: online experiment with **244** usable participants. A 15-row × 9-column table, 6 questions (3 striped, 3 plain), randomized order.
  - Error rate was ≤ 12% on all questions, and there was "essentially no difference in accuracy" between striped and plain tables. Only one speed difference (question 6) was significant.
  - **46% preferred striping** and 33% had no preference.
  - Some participants traced rows with a finger or mouse, which suggests striping may reduce effort.
  - Enders gives no firm recommendation and says the choice "probably comes down to a subjective assessment of likely gains versus the cost of implementation." Wider tables and horizontal scrolling might show stronger effects.

  Source: [A List Apart: Zebra Striping: Does it Really Help?](https://alistapart.com/article/zebrastripingdoesithelp/)
- **[PRACTICE] Carbon** ships an optional `--zebra` table modifier and five row heights: 24, 32, 40, 48 (default), 64. — [Carbon _data-table.scss](https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/styles/scss/components/data-table/_data-table.scss)
- **[PRACTICE] Polaris** table cell padding token = 6px. — [Polaris space.ts](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/space.ts)
- **[PRACTICE] MDC Data Table** markup marks numeric columns with `mdc-data-table__header-cell--numeric` (right-aligned numeric cells). — [MDC data-table README](https://raw.githubusercontent.com/material-components/material-components-web/master/packages/mdc-data-table/README.md)

### Inferences
- Defaults for the ERP:
  - Right-align numbers and money, left-align text.
  - Use sticky headers for long lists.
  - Offer zebra striping as an optional preference rather than a hard rule.
  - Make row density switchable: 32 compact, 40 default, 48 touch.
  - Truncate with an ellipsis plus a tooltip or expandable detail, and keep key columns at fixed minimum widths.

### Gaps
- No primary sources were fetched on sticky headers, column-width or truncation best practice, such as NN/g "Data Tables: Four Major User Tasks" or the Enders follow-up study. These remain practice-level recommendations without citations here.
