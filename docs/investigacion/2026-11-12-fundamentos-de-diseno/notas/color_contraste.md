# Color systems and contrast for web app UIs (2026) — basis for a semantic color system for the CAYLA ERP

Brand palette under analysis: Rojo #B8412D (accent), Crema #F5F0E8 (background), Tinta #1A1A18 (text); secondary Rojo profundo #8B2A1F, Sand #E8E0D0, Taupe #A47865.

Labels used throughout: **[STANDARD]** = normative W3C text; **[EVIDENCE]** = peer-reviewed or empirical study; **[PRACTICE]** = design-system documentation or vendor practice; **[COMPUTED]** = calculated here by script; **[INFERENCE]** = my reasoning, not sourced.

## Contrast standards: WCAG 2.2, APCA, WCAG 3 status, and computed ratios for the brand pairs

### Takeaway
WCAG 2.2 is still the only contrast standard you can conform to in 2026. WCAG 3's 10 Sep 2026 Working Draft still has "@@[contrast measure to be determined]" and names no algorithm. APCA was removed from the WCAG 3 draft in 2023 and is now only "draft guidance". The safe rule is to **pass WCAG 2.2 as the hard gate and use APCA Lc as a second, stricter design check**, mainly for dark mode and for thin or small text. For the CAYLA palette: Tinta on Crema/Sand is excellent; Rojo works for text on Crema/white but **fails on Sand** (4.18:1); Taupe **fails as text** on every light surface and is only fit for decoration or large non-text shapes.

### Cited Findings
**WCAG 2.2 non-text contrast and focus [STANDARD]**
- SC 1.4.11 Non-text Contrast (AA): "The visual presentation of the following have a contrast ratio of at least 3:1 against adjacent color(s)". It covers visual cues needed to identify a UI component and its states (checked, selected, focused) and "parts of graphics required to understand the content" (chart lines, pie slices). Ratios are thresholds, so 2.999:1 fails. — [W3C Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- 1.4.11, input borders: a border is required only when no other visual cue identifies the control. When the border is the identifying cue ("a complete border (#767676)"), it must meet 3:1 against the adjacent color. For an input with a white interior, dark border and white exterior, the exterior color is the one that counts. — [W3C Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- 1.4.11 exceptions: inactive (disabled) components; unmodified user-agent styling; graphics where a particular presentation is essential (logos, flags); decorative graphics, or graphics whose information is also given as text. Hover states do not need 3:1, but hover must not reduce contrast against adjacent colors or weaken focus/selection indicators. Contrast is measured from the CSS colors, not the anti-aliased rendering. A color change between states needs 3:1 only when the states appear next to each other. — [W3C Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- SC 2.4.13 Focus Appearance (**AAA**): "When the keyboard focus indicator is visible, an area of the focus indicator meets all the following: is at least as large as the area of a 2 CSS pixel thick perimeter of the unfocused component or sub-component, and has a contrast ratio of at least 3:1 between the same pixels in the focused and unfocused states." The indicator need not be a literal 2px outline, only at least that large. 2.4.7 Focus Visible (AA) only requires that a visible indicator exists. — [W3C Understanding 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- Note: 1.4.3 (4.5:1 normal text / 3:1 large text, AA), 1.4.6 (7:1 / 4.5:1, AAA) and 2.4.11 Focus Not Obscured (Minimum, AA: the focused element is not entirely hidden by author content such as sticky headers) were not fetched in this session. The thresholds are standard WCAG 2.x values and are applied in the computed table below. Large text in WCAG 2 is 18pt (24px) regular or 14pt (~18.66px) bold.

**WCAG 3 status (as of Nov 2026) [STANDARD, draft]**
- The current WCAG 3.0 Working Draft is dated **10 September 2026**. "Text contrast sufficient (minimum)" says text "meets @@[contrast measure to be determined]". "Graphical object contrast sufficient" requires "a minimum contrast ratio test" with no test named. Editor's note: "The contrast algorithm used in WCAG 3 is yet to be determined." The note expects the algorithm to include a size/weight factor and says a separate red/green CVD requirement may be needed. The draft "still has several years of work". — [W3C WCAG 3.0 WD](https://www.w3.org/TR/WCAG30/)
- APCA was marked for removal under the exploratory-content rule (30 Jan 2023) and dropped from the 24 July 2023 WD. The 8 Apr 2026 editor's draft lists contrast as exploratory with no algorithm. Roselli estimates WCAG 3 at "2030 at the soonest". His advice is to choose colors that also meet WCAG 2, or to document the decision. — [Adrian Roselli, "WCAG3 Contrast as of April 2026"](https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html)
- Andrew Somers (APCA author), commenting on the same post on 15 Apr 2026: "APCA is draft guidance we are actively testing and evaluating", and it should not be called "WCAG 3". He argues that colors passing APCA usually also exceed WCAG 2 minimums, and points to "BridgePCA" (passes WCAG 2 while adding APCA guidance). — [Roselli post, comments](https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html)

**APCA levels and criticisms of WCAG 2 math [PRACTICE / author claims]**
- APCA Lc guidance (reference font Helvetica/Arial): **Lc 90** preferred for body text (≥14px/400); **Lc 75** minimum for body-text columns (≥18px/400); **Lc 60** minimum for other content text (≥24px/400 or 16px/700); **Lc 45** for large heavy text and headlines (≥36px/400 or 24px/700) and detailed pictograms; **Lc 30** absolute minimum for placeholder, disabled text and large solid non-text elements; **Lc 15** absolute minimum for discernible non-text elements (≥5px). Add Lc 15 to each value for AAA-like targets. Negative Lc means light text on a dark background. There is a preliminary "Dark Mode Maximum" of Lc −90 for large fonts. — [APCA Easy Intro](https://git.apcacontrast.com/documentation/APCAeasyIntro.html)
- Criticism of WCAG 2 from the APCA docs: WCAG 2.x "far overstates contrast for dark colors"; "The WCAG 4.5:1 ratio can be functionally unreadable when a color is near black"; WCAG 2.x "cannot provide useful guidance when designing 'dark mode'". — [APCA Easy Intro](https://git.apcacontrast.com/documentation/APCAeasyIntro.html). Note these are claims by the method's author, not independent evidence.
- Radix Colors guarantees that steps 11 and 12 hit **APCA Lc 60 and Lc 90** on step 2 of the same scale. This shows APCA in use as a design target in a major system. — [Radix: Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)

**Computed contrast for the brand palette [COMPUTED]**

Formulas (script at /home/claude/scripts/contrast.py):
- WCAG 2 relative luminance: per channel c = sRGB/255, linear = c/12.92 if c ≤ 0.04045 else ((c+0.055)/1.055)^2.4; L = 0.2126 R + 0.7152 G + 0.0722 B; ratio = (L_hi + 0.05)/(L_lo + 0.05).
- APCA 0.0.98G-4g (SAPC): Y = 0.2126729 R^2.4 + 0.7151522 G^2.4 + 0.0721750 B^2.4 (simple exponent, no linear segment); soft black clamp: if Y < 0.022, Y += (0.022−Y)^1.414. Dark text on light bg: S = (Ybg^0.56 − Ytxt^0.57)·1.14, Lc = (S − 0.027)·100 (0 if S < 0.1). Light text on dark bg: S = (Ybg^0.65 − Ytxt^0.62)·1.14, Lc = (S + 0.027)·100 (0 if S > −0.1).
- Validated against published APCA reference values: #888 on #fff = Lc 63.1, #fff on #888 = −68.5, #000 on #aaa = 58.1, #aaa on #000 = −56.2 (all match).

| Text / fg | Background | WCAG 2 | AA text 4.5 | AA large/UI 3.0 | AAA 7.0 | APCA Lc |
|---|---|---|---|---|---|---|
| Tinta #1A1A18 | Crema #F5F0E8 | **15.36** | pass | pass | pass | **95.7** |
| Tinta | Sand #E8E0D0 | 13.28 | pass | pass | pass | 86.4 |
| Tinta | White | 17.43 | pass | pass | pass | 104.3 |
| Rojo #B8412D | Crema | **4.83** | pass | pass | FAIL | 67.8 |
| Rojo | Sand | **4.18** | **FAIL** | pass | FAIL | 58.6 |
| Rojo | White | 5.48 | pass | pass | FAIL | 76.4 |
| Crema | Rojo (button) | 4.83 | pass | pass | FAIL | −72.3 |
| White | Rojo (button) | 5.48 | pass | pass | FAIL | −81.8 |
| Rojo profundo #8B2A1F | Crema | **7.56** | pass | pass | pass | 79.9 |
| Rojo profundo | Sand | 6.54 | pass | pass | FAIL | 70.6 |
| Crema | Rojo profundo | 7.56 | pass | pass | pass | −83.6 |
| White | Rojo profundo | 8.58 | pass | pass | pass | −93.1 |
| Taupe #A47865 | Crema | **3.39** | **FAIL** | pass | FAIL | 57.3 |
| Taupe | Sand | **2.93** | FAIL | **FAIL** | FAIL | 48.1 |
| Taupe | White | 3.85 | FAIL | pass | FAIL | 65.9 |
| Tinta | Taupe | 4.53 | pass (barely) | pass | FAIL | **36.4** |
| Crema | Taupe | 3.39 | FAIL | pass | FAIL | −61.9 |
| Sand | Crema (surface edge) | **1.16** | FAIL | FAIL | FAIL | 0.0 |
| Crema | Tinta (dark mode) | 15.36 | pass | pass | pass | −97.1 |
| Sand | Tinta | 13.28 | pass | pass | pass | −87.0 |
| Taupe | Tinta | 4.53 | pass | pass | FAIL | −34.4 |
| Rojo | Tinta (dark mode) | **3.18** | **FAIL** | pass | FAIL | **−24.0** |
| Rojo profundo | Tinta | 2.03 | FAIL | FAIL | FAIL | −12.4 |
| Rojo | Rojo profundo | 1.56 | FAIL | FAIL | FAIL | −10.5 |

OKLCH coordinates (Ottosson OKLab matrices) [COMPUTED]:
- Rojo oklch(53.9% 0.158 31.9)
- Rojo profundo oklch(43.2% 0.134 29.9)
- Taupe oklch(61.2% 0.062 44.4)
- Sand oklch(90.9% 0.023 84.6)
- Crema oklch(95.7% 0.012 79.8)
- Tinta oklch(21.7% 0.004 106.7)

### Inferences
- **Tinta on Crema** (15.4:1, Lc 95.7) clears every level, including APCA's preferred body level. It can be the default `fg` on `bg`.
- **Rojo as text or link** passes AA on Crema (4.83) and white, but **not on Sand** (4.18). Either keep red text off Sand surfaces, or use Rojo profundo (6.54 on Sand) for red text there. APCA rates Rojo on Crema at Lc 67.8, below the Lc 75 body minimum. Use Rojo for short labels and links, not paragraphs.
- **Rojo as a solid button fill** with Crema or white text passes AA (4.83 / 5.48). White text gives more margin (Lc −81.8 vs −72.3). Rojo profundo is a natural **hover/pressed** fill (8.58 with white text). Rojo vs Rojo profundo is only 1.56:1, which is fine because 1.4.11 does not require 3:1 between states unless they sit side by side.
- **Taupe is not a text color** on any light surface (3.39 on Crema; Lc 57 is below the Lc 60 content minimum). As a UI boundary it passes 3:1 on Crema and white, but **not on Sand** (2.93). It can serve as an input border on Crema/white only. Tinta on a Taupe fill technically passes 4.53:1 but scores APCA Lc 36. This is a textbook case of WCAG 2 overstating mid-dark contrast, so avoid Tinta-on-Taupe text.
- **Sand vs Crema is 1.16:1.** Sand cards on a Crema page do not separate by contrast alone. Decorative surface separation is not covered by 1.4.11, but when the card boundary identifies a control, a 3:1 border is needed.
- **Dark mode breaks the brand red:** Rojo on Tinta is 3.18:1 / Lc −24. A dark theme needs a lighter red tone for text and links (roughly OKLCH L ≈ 65–70%, to be verified by computation), not the brand hex. Rojo profundo is unusable on dark surfaces.
- Focus ring: a 2px Tinta or Rojo profundo ring on Crema meets 1.4.11 and the 2.4.13 AAA area and contrast-change rule. A Taupe ring is borderline (3.39 on Crema) and fails on Sand.

### Gaps
- The W3C Understanding pages for 1.4.3, 1.4.6 and 2.4.11 were not fetched in this session. Their thresholds above are standard WCAG 2.x values, not quoted text.
- No independent peer-reviewed validation of APCA was found. APCA's superiority claims come from its author.
- BridgePCA was only mentioned in the Somers comment and not examined.

## Color spaces and scale generation (OKLCH/OKLab, CSS Color 4, Material HCT, Radix, Tailwind v4, Leonardo, Carbon, Atlassian)

### Takeaway
Leading systems generate scales in a **perceptual space** (OKLCH, or HCT for Material) so that equal lightness steps look equal across hues. They then assign **roles per step** rather than per hex. Radix's 12-step model maps cleanly to an ERP. Tailwind v4 ships its whole palette in `oklch()` and uses `color-mix(in oklab, …)` for opacity. Carbon's layering tokens solve the "card on page on panel" problem that an ERP has everywhere.

### Cited Findings
- OKLab (Björn Ottosson, published **23 Dec 2020**) is a perceptual color space for "predicting perceived lightness, chroma and hue", with perceptually independent attributes, so changing one does not shift the others. It was created because CIELAB has an "inability to predict hue" and "blue hues are predicted badly". In HSV gradients, "Yellow, magenta and cyan appear much lighter than red and blue." It "can also be transformed into polar form, with the coordinates lightness, chroma and hue" (this is OKLCH). A 2025 introduction notes adoption in Photoshop, CSS Color Levels 4 and 5, and game engines. — [Ottosson, "A perceptual color space for image processing"](https://bottosson.github.io/posts/oklab/) [EVIDENCE/technical]
- Tailwind CSS v4.0 (**22 Jan 2025**): "We've upgraded the entire default color palette from `rgb` to `oklch`, taking advantage of the wider gamut…" The balance between colors was kept the same as v3. v4 uses `color-mix()` for opacity modifiers, e.g. `background-color: color-mix(in oklab, var(--color-blue-500) 50%, transparent);`. — [Tailwind CSS v4.0 blog](https://tailwindcss.com/blog/tailwindcss-v4) [PRACTICE]
- Radix Colors 12-step roles: 1 app background; 2 subtle background (cards, sidebars); 3 UI element background; 4 hover; 5 pressed/selected; 6 subtle borders/separators on non-interactive components; 7 subtle borders on interactive components; 8 stronger borders on interactive components and **focus rings**; 9 solid backgrounds (highest chroma, "purest step"; brand fills, headers, accent borders); 10 solid hover; 11 low-contrast text; 12 high-contrast text. Steps 11 and 12 guarantee APCA Lc 60 / Lc 90 on step 2. Most step-9 colors are designed for white text; Sky, Mint, Lime, Yellow and Amber take dark text. — [Radix: Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) [PRACTICE]
- Material Color Utilities: **HCT** combines CAM16 (hue, chroma) with L\*a\*b\* lightness. In its example, HCT tone (62.31) equals the L\* value. When converting to RGB, "HCT keeps the tone, and reduces chroma until the color is feasible." Material does most of its calculations in HCT. — [material-color-utilities: color_spaces.md](https://github.com/material-foundation/material-color-utilities/blob/main/concepts/color_spaces.md) [PRACTICE]
- IBM Carbon tokens are named by role and grouped by UI element (`$background`, `$layer-01`, `$field-01`, `$border-subtle-01`, `$text-secondary`, `$focus`), in three tiers (core, component, AI). Layering: `$layer-01` is a container on `$background`, `$layer-02` on `$layer-01`, `$layer-03` on `$layer-02`, each with hover/active/selected variants. Fields and subtle borders pair with the layer they sit on. In the White theme the layers alternate (#ffffff → #f4f4f4 → #ffffff → #f4f4f4) so adjacent layers stay distinct. Text roles: `$text-primary`, `$text-secondary` (also input labels), `$text-placeholder`, `$text-on-color`. Status roles: `$support-error/success/warning/info`, each with `-inverse`. `$interactive` is for selected/active/accent elements at 3:1. `$focus` has `-inset` and `-inverse` variants. — [Carbon color tokens](https://carbondesignsystem.com/elements/color/tokens/) [PRACTICE]
- Atlassian tokens follow **foundation.property.modifier** (e.g. `color.icon.success`). The modifier carries "color role, emphasis, or interaction state". "Choose tokens based on meaning where applicable, not specific values." "Don't use a token just because the colors appear to match. This can break the experience in other themes." — [Atlassian: Design tokens](https://atlassian.design/foundations/tokens/design-tokens) [PRACTICE]

### Inferences
- A workable CAYLA approach: build three OKLCH ramps, each with about 12 steps on Radix roles. (1) A **warm neutral** ramp, hue ≈ 80–85°, chroma ≈ 0.01–0.025, anchored at Crema (L 95.7%, step 1–2), Sand (L 90.9%, step 3–4) and Tinta (L 21.7%, step 12). (2) A **red** ramp at hue ≈ 30–32°, anchored at Rojo (L 53.9%, step 9) and Rojo profundo (L 43.2%, step 10/11). (3) Taupe (hue 44°, L 61%) as a muted accent or "brown" ramp for decoration and illustrations.
- Map Carbon-style layering onto the neutrals. Page = Crema; layer-01 = a lighter surface (white or near-white) for tables and forms; layer-02 = Sand for nested panels. This alternation mirrors Carbon's white/#f4f4f4 pattern. Add a **border token with ≥3:1** wherever a boundary identifies a control, since Sand vs Crema is only 1.16:1.
- Use Atlassian-style naming: `color.bg.*`, `color.text.*`, `color.border.*`, `color.icon.*`, modifiers `brand | danger | warning | success | info | neutral`, emphasis `subtle | default | bold`, states `hovered | pressed | selected | disabled`.

### Gaps
- **leonardocolor.io** (Adobe Leonardo, contrast-ratio-targeted generation) and **MDN color-mix()** could not be fetched: the permission request for these URLs timed out (blocked: https://leonardocolor.io/ and https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix). Leonardo's method (generating colors by target contrast ratio against a background) and the Baseline dates for `oklch()`/`color-mix()` are therefore not cited here.
- The m3.material.io "science of color design" page needs JavaScript and returned no content. The often-quoted HCT rule (tone difference ≥40 ≈ 3:1, ≥50 ≈ 4.5:1) could **not** be verified from a primary source in this session.
- Atlassian's full role/emphasis list (subtlest…bolder, discovery, etc.) is on its "all tokens" page, which was not fetched.

## Semantic tokens and state colors, especially when the brand color is red

### Takeaway
Systems with a red brand use the red **sparingly as an accent** and **reserve a different hue for danger/error**. Red Hat is a documented example: brand red is an accent, and danger/error uses "red orange", reserved for that purpose. With a red accent, an ERP should not rely on hue alone to tell "brand action" from "error". Error states need an icon, text and position cues, and danger should sit at a clearly different lightness and/or hue from Rojo.

### Cited Findings
- Red Hat Design System (red brand): "Red is also a strong color, so use it as an accent, not to fill large areas." "For danger or error states, use red orange." Status colors: "It is not recommended to use those colors anywhere else." Status scale: Warning = yellow, Caution = orange, Danger = red orange. Blue is the common color for inline links and buttons; red is for sparing use on primary CTAs. "All text links require an underline except in certain rare edge cases." Pure black is reserved for logos and illustrations; UI uses #151515. — [Red Hat: Using color](https://ux.redhat.com/foundations/color/usage) [PRACTICE]
- Carbon keeps status in dedicated `$support-*` tokens, separate from the `$interactive` and brand tokens. — [Carbon color tokens](https://carbondesignsystem.com/elements/color/tokens/) [PRACTICE]
- Atlassian: choose tokens by meaning, not by matching value. A brand token that happens to look like danger must not be used for danger, or the reverse. — [Atlassian: Design tokens](https://atlassian.design/foundations/tokens/design-tokens) [PRACTICE]
- The WCAG 3 WD says a separate requirement for red/green color-vision deficiency may be needed. — [W3C WCAG 3.0 WD](https://www.w3.org/TR/WCAG30/) [STANDARD, draft]

### Inferences
- Options for CAYLA, where Rojo's hue is about 32° (an orange-red brick):
  - (a) Follow Red Hat: keep Rojo for brand and primary actions, and give danger a **clearly different hue**, such as a cooler crimson (hue ≈ 20–25°) at a darker tone, always paired with an icon and the word "Error".
  - (b) Make the **primary action button Tinta (neutral dark)** and keep Rojo for brand moments (logo, selected nav, highlights). Red then appears rarely enough that an error is still noticed. This also follows Red Hat's "accent, not large areas".
  - (c) If a red primary button is kept, error must never be signalled by a red fill alone. Use an error icon, message text and a field-level border plus helper text.
- Warning should be amber/yellow and success green or teal, both well separated in hue from 32°. Info can be blue or the neutral ramp. Verify each state's fg/bg pair with the same script (≥4.5:1 for text, ≥3:1 for icons and borders).
- Destructive actions (delete or annul a sale) should use the danger token, not the brand Rojo. Otherwise "Guardar" and "Anular" look identical in meaning.

### Gaps
- No primary sources were fetched for Airbnb, Netflix, YouTube, Coca-Cola or Target design systems. How those red-primary brands separate brand red from error is **not cited**. Search surfaced secondary articles (UX Movement "why you shouldn't use your brand color…", uxcel) that were not fetched or verified.

## Color-vision deficiency (CVD): prevalence, never color alone, simulation

### Takeaway
CVD is overwhelmingly male and red-green. It varies by ancestry: one large study found 5.6% of white boys and 2.6% of Hispanic boys affected, against 0–0.5% of girls. For an ERP with a red accent, red/green and red/brown confusions are the main risk. Status must never be conveyed by color alone (WCAG 1.4.1).

### Cited Findings
- Xie JZ et al., "Color Vision Deficiency in Preschool Children", *Ophthalmology* 2014 (DOI 10.1016/j.ophtha.2014.01.018). n = 4,005 children aged 3–6 in Los Angeles and Riverside counties. Prevalence in boys: Caucasian 5.6%, Asian 3.1%, **Hispanic 2.6%**, African-American 1.4%. Girls: "0 percent to 0.5 percent" across ethnicities. — [ScienceDaily summary of Xie et al. 2014](https://sciencedaily.com/releases/2014/04/140403084243.htm) [EVIDENCE]
- Polarity and color rules in the WCAG 3 draft flag red/green CVD as a possible future requirement. — [W3C WCAG 3.0 WD](https://www.w3.org/TR/WCAG30/) [STANDARD, draft]
- Red Hat uses underlines on links, a non-color cue. — [Red Hat: Using color](https://ux.redhat.com/foundations/color/usage) [PRACTICE]

### Inferences
- The Hispanic figure in Xie et al. comes from a US (California) population, so it only approximates Peru. It does suggest prevalence among Peruvian men is lower than the classic Northern European ~8%, but likely in the 2–5% range. In a team of ~30 (mostly women in retail), expect 0–1 affected people. For customer-facing or male staff the risk is real, and the rule costs nothing.
- Rojo (hue 32°, L 54%) and Taupe (hue 44°, L 61%) have similar lightness and nearby hue. Under protan/deutan simulation they will likely collapse into one brownish tone, so do not use Rojo vs Taupe to encode two different states. (To verify with a simulator.)
- ERP rules that follow: status badges always carry a text label and/or icon; chart series differ by lightness and markers or dash patterns, not just hue; links in body text are underlined; form errors show icon plus text.

### Gaps
- WCAG 1.4.1 Use of Color Understanding page was not fetched. The rule ("color is not used as the only visual means of conveying information") is well known but not quoted here.
- The classic **~8% men / ~0.5% women (Northern European ancestry)** figure could not be retrieved from a primary source: colourblindawareness.org was blocked by a permission timeout, and Wikipedia was only seen as a search snippet.
- No Latin America–specific prevalence study was fetched. A Brazilian study (SciELO, Rev Bras Oftalmol) failed to load, and a Rev Bras Oftalmol 2026 paper appeared in search but was not read.
- Simulation tools (Chrome DevTools "Emulate vision deficiencies", Figma plugins, Coblis, Viz Palette) were not researched. No CVD simulation was computed for the brand pairs.

## Warm off-white vs pure white backgrounds; dark mode evidence and whether an ERP should offer it

### Takeaway
The evidence strongly favors **positive polarity (dark text on light background)** for reading performance, especially at small sizes. That suits a dense ERP. Evidence that an off-white or cream background beats pure white is thin. The best available study found warm tints (peach, orange, yellow) read fastest among tinted backgrounds, but it did not test white, so Crema is defensible on brand grounds rather than proven superior. NN/g recommends light mode as default and offering dark mode as a user option.

### Cited Findings
- Piepenbrock (dissertation, Heinrich-Heine-Universität Düsseldorf, 2014; supervisors Mayr & Buchner): "All studies showed a consistent positive polarity advantage."
  - Mechanism hypothesis: "The higher luminance of positive polarity displays leads to a stronger pupillary constriction", which reduces spherical aberration and increases depth of field.
  - Experiment 1: "The positive polarity advantage increased linearly with decreasing character size" (8–14pt proofreading).
  - Experiment 2: smaller pupils under positive polarity; pupil size was measured, not manipulated, so the result is correlational.
  - Experiment 3 (Piepenbrock, Mayr, Mund & Buchner 2013, *Ergonomics* 56, 1116–1124): both younger and older adults benefited; no age-by-polarity interaction on proofreading. Recommendation: dark text on light background regardless of age.
  - Subjective ratings often showed no difference even when performance did.
  - Source: [Piepenbrock dissertation, Uni Düsseldorf](https://docserv.uni-duesseldorf.de/servlets/DerivateServlet/Derivate-31413) [EVIDENCE]
- NN/g on dark mode: "in users with normal vision, light mode leads to better performance most of the time." Dark mode may help people with cloudy ocular media such as cataracts (Legge: 7 participants "had better reading rates with dark modes"), with the caveat that those studies used CRT displays. Recommendations: "we don't recommend switching to dark mode by default"; "we strongly recommend that designers allow users to switch to dark mode if they want to"; use the OS dark-mode API and apply the choice across all screens. — [NN/g: Dark Mode vs. Light Mode](https://www.nngroup.com/articles/dark-mode/) [EVIDENCE summary / PRACTICE]
- Rello & Bigham, "Good Background Colors for Readers: A Study of People with and without Dyslexia", ASSETS '17. n = 341 Spanish-speaking adults (89 with dyslexia, 252 controls); black text on 10 tinted backgrounds. Peach, Orange and Yellow gave the fastest reading in both groups (controls: Peach 12.28 s, Orange 12.32 s vs Blue Grey 18.82 s). Cool colors were slowest. **White and cream were not tested.** The authors say the results "do not necessarily mean that warm colors are recommended" and that more studies are needed. The paper's hex codes do not always match the color names (e.g. Orange listed as #EDDD6E). — [Rello & Bigham 2017 (PDF)](https://www.changedyslexia.org/publications/pdfs/2017-ASSETS-Good%20Background%20Colors.pdf) [EVIDENCE]
- Red Hat sets canvas defaults of white (light) and black (dark), and limits pure black to logos and graphics, using #151515 for UI. This is a practice of avoiding pure black for text. — [Red Hat: Using color](https://ux.redhat.com/foundations/color/usage) [PRACTICE]

### Inferences
- Crema (L 95.7%, relative luminance 0.876 vs 1.0 for white) slightly lowers peak luminance while keeping 15.4:1 with Tinta. Positive polarity is kept, and Tinta (#1A1A18) is a near-black, consistent with the "avoid pure black" practice. This is a sound default, but present it as a brand and comfort choice, not as evidence-proven.
- Because the polarity advantage grows as text shrinks, and ERP tables use small text, **light mode should be the default**. Dark mode is worth offering as an opt-in for staff working at night or with low-vision needs, but only once a dedicated dark ramp exists, since the brand Rojo fails on Tinta (3.18:1). Treat dark mode as a lower-priority feature.

### Gaps
- No controlled study comparing off-white or cream with pure white for screen reading or eye strain was found. Search results were blogs or unverified pages.
- The 2018 myopia and light-mode study mentioned by NN/g was not checked at source.

## How many colors per screen: 60-30-10 and restraint

### Takeaway
The only documented guidance found is restraint around the accent: Red Hat says to use brand red "as an accent, not to fill large areas". The 60-30-10 rule is interior-design and decoration lore with no primary source located. For an ERP, the practical reading is roughly 90%+ neutrals (Crema, white or Sand surfaces, Tinta text), a small share of brand red, and status colors only where state exists.

### Cited Findings
- "Red is also a strong color, so use it as an accent, not to fill large areas." — [Red Hat: Using color](https://ux.redhat.com/foundations/color/usage) [PRACTICE]
- Radix reserves the high-chroma step 9 for solid fills, brand moments and accent borders. Steps 1–8 (low chroma) carry backgrounds and borders, so most of a screen is low-chroma by design. — [Radix: Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) [PRACTICE]

### Inferences
- Suggested ERP budget: neutrals for page, surfaces, text and borders on almost all pixels; Rojo only for the single primary action per view, active nav or selection, and brand marks; Taupe and Sand as decorative warmth; status hues only on badges, alerts and validation. On a given screen, more than one solid-red element competes with errors.

### Gaps
- No authoritative source for the "60-30-10 rule" in UI design was retrieved.
- No source was retrieved on how premium or luxury brands restrain color in their digital products (Hermès, Aesop and similar examples are not cited).
