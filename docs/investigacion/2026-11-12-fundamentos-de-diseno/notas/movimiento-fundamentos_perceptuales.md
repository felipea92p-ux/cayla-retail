# Perceptual, cognitive and aesthetic foundations of UI motion

Scope note: this covers why motion helps or hurts UX (perception, cognition, aesthetics) and which concrete techniques follow from that. Evidence level is marked as [EVIDENCE] (peer-reviewed or controlled study), [STANDARD] (official spec or platform guidance) or [PRACTICE] (practitioner or folk wisdom with no study behind it).

## 1. Response-time thresholds and perceived performance (Miller 1968, Card et al. 1991, Nielsen, Doherty, RAIL, INP)

### Takeaway
The 0.1 s / 1 s / 10 s limits have held for decades and come from Miller (1968) and Card, Robertson & Mackinlay (1991). Google's RAIL model turns them into budgets: respond within 100 ms, render each frame in 16 ms or less. INP is now the field metric: 200 ms or less is "good", over 500 ms is "poor". For motion, this means feedback has to start within about 100 ms even when the animation itself lasts longer.

### Cited Findings
- [STANDARD/EVIDENCE-derived] 0.1 s is the limit for the system to feel like it is "reacting instantaneously", with no special feedback needed. 1.0 s is the limit for keeping the user's "flow of thought" uninterrupted: users notice the delay and lose the sense of operating directly on the data. 10 s is the limit for holding attention, and anything longer needs a completion estimate. — [NN/g, Response Times: The 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/)
- The sources NN/g gives for these limits: Miller, R. B. (1968), "Response time in man-computer conversational transactions," *Proc. AFIPS Fall Joint Computer Conference*, Vol. 33, pp. 267–277; and Card, S. K., Robertson, G. G., & Mackinlay, J. D. (1991), "The information visualizer: An information workspace," *Proc. ACM CHI'91*, pp. 181–188. NN/g says the advice "has been about the same for thirty years." — [NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)
- NN/g's 2014 web restatement: at 0.1 s users feel they are directly manipulating objects. At 1 s they feel they are freely navigating. At 10 s they keep attention on the task, and longer delays need a percent-done indicator plus a way to interrupt. — [NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)
- Doherty Threshold: productivity rises when computer and user interact fast enough that neither waits on the other, which puts the threshold under 400 ms. It comes from Walter J. Doherty & Ahrvind J. Thadani (1982), *IBM Systems Journal*, which replaced the earlier 2-second standard. Sub-400 ms systems were described as "addicting." — [Laws of UX, Doherty Threshold](https://lawsofux.com/doherty-threshold/). Original IBM document (form GE20-0752-00, © IBM 1982, 1997): [The Economic Value of Rapid Response Time](https://www.vm.ibm.com/devpages/jelliott/evrrt1.html?lnk=hmhm). Note: the online version I could fetch had only the title and figure caption, so the 400 ms figure and the "addicting" quote are relayed from Laws of UX, not checked against the original text.
- [PRACTICE] Laws of UX also claims that perceived performance can shorten the sense of waiting without changing actual time, that animation keeps users engaged during background work, that progress bars make waits more tolerable whether or not they are accurate, and that a deliberate delay can make a process seem more valuable and build trust. — [Laws of UX](https://lawsofux.com/doherty-threshold/) (these are summary claims, and Laws of UX cites no study for each one)
- [STANDARD] RAIL (Google):
  - Response: "Complete a transition initiated by user input within 100 ms", and "process user input events within 50 ms."
  - Animation: "Produce each frame in an animation in 10 ms or less", with a strict budget of 16 ms per frame.
  - Idle: do idle work in chunks of 50 ms or less.
  - Load: interactive in 5 s or less on mid-range mobile over slow 3G, and under 2 s for later loads.
  - Source: [web.dev, RAIL](https://web.dev/articles/rail)
- [STANDARD] RAIL perception table:
  - 0–16 ms: "Users are exceptionally good at tracking motion, and they dislike it when animations aren't smooth."
  - 0–100 ms: the result feels immediate.
  - 100–1000 ms: things feel like "a natural and continuous progression of tasks."
  - Over 1 s: users lose focus.
  - Over 10 s: users are frustrated and likely to abandon.
  - web.dev now points to Core Web Vitals as the recommended approach, which uses different thresholds. — [web.dev, RAIL](https://web.dev/articles/rail)
- [STANDARD] INP (Interaction to Next Paint) measures overall responsiveness to clicks, taps and key presses. It reports the longest interaction, ignoring outliers. At the 75th percentile of field page loads, "good" is 200 ms or less, "needs improvement" is over 200 ms up to 500 ms, and "poor" is over 500 ms. An interaction has three phases: input delay, processing duration, and presentation delay (callbacks finished until the next frame is painted). — [web.dev, INP](https://web.dev/articles/inp)

### Inferences
- An animation does not violate the 100 ms "instant" limit as long as its first visible frame lands within about 100 ms of input. The response is the onset of change, not its completion. This is why ease-out curves (fast start) feel responsive (see section 5).
- The 100–1000 ms band ("natural and continuous progression") is where UI transitions live. NN/g's 100–500 ms duration guidance (section 5) sits well inside it.
- A long animation on a critical path adds to perceived latency. It can push an interaction past the 400 ms Doherty threshold or the 1 s flow limit even when the backend is fast.

### Gaps
- I could not fetch the original Doherty & Thadani text, so the 400 ms figure is relayed from secondary sources. Researchers have questioned how broadly the "productivity" claims apply. I found no modern replication.
- Optimistic UI: I found no peer-reviewed study that measures how optimistic updates (showing success before the server confirms) affect perceived speed or trust. Treat it as [PRACTICE].
- I did not confirm the date INP replaced FID as a Core Web Vital. My training knowledge says March 2024, but the page I fetched did not state it.

## 2. Perception science: attention capture, Gestalt in motion, object constancy, apprehension limits

### Takeaway
The onset of motion captures attention automatically, while ongoing motion does not (Abrams & Christ 2003). That makes motion a strong signal and a costly distractor at the same time. Animated transitions measurably help people track objects and estimate changes (Heer & Robertson 2007), and they preserve object identity across state changes (Chang & Ungar 1993). Tversky et al. (2002) warn that many apparent benefits of animation come from confounded study designs, and that animation helps mainly when it fits the content (congruence) and can be perceived accurately (apprehension).

### Cited Findings
- [EVIDENCE] Abrams & Christ (2003), *Psychological Science*, "Motion onset captures attention":
  - Ongoing motion gave no search advantage over static items, i.e., "motion per se does not automatically attract attention."
  - Items that had just started moving were found faster even when the motion carried no information about the target.
  - Detection of a just-started item did not depend on the number of distractors.
  - Inhibition of return followed, which is another sign that attention had been captured.
  - Source: [PubMed 12930472](https://pubmed.ncbi.nlm.nih.gov/12930472/)
- [EVIDENCE, cited by NN/g] Pratt et al. (2010), "It's Alive! Animate motion captures visual attention," *Psychological Science*, is listed among NN/g's sources on animation. — [NN/g, Animation duration](https://www.nngroup.com/articles/animation-duration/) (I did not read the paper itself)
- [EVIDENCE] Chang & Ungar (1993, UIST'93, pp. 45–55) argue that animation moves the work of interpreting change onto perception, "offloading some of the cognitive burden of interpreting the change to the perceptual system." "Eliminating sudden visual changes" lowers the chance that users are surprised. When an object jumps across the screen in one frame, "the very identity of the object breaks down," which is the object-constancy argument. — [Chang & Ungar 1993 PDF](https://bibliography.selflanguage.org/_static/animation.pdf)
- [EVIDENCE] Heer & Robertson (2007), "Animated Transitions in Statistical Data Graphics" (IEEE InfoVis):
  - Experiment 1 (object tracking): 24 subjects tracked 2 highlighted targets across 6 transition types, comparing static, direct animation and staged animation, with 1.25 s animations. Animation significantly reduced error versus static in every type. Staging beat direct animation in most cases, with significant gains for Zoom & Filter. Staging increased error for the Timestep Scatter Plot.
  - Experiment 2 (estimating changing values): 2 s animations. Animation significantly beat static for scatter plots, grouped bars and donut charts. Stacked bars showed no significant difference. Donut charts favored direct over staged animation.
  - Source: [Heer & Robertson 2007 PDF](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf); summary at [UW IDL](https://idl.uw.edu/papers/animated-transitions)
- [EVIDENCE] Heer & Robertson 2007, subjective ratings (1–5 scale): animation was easier to understand (M = 4.20), fun and engaging (M = 4.54), and something subjects would use in analysis (M = 4.17) and presentations (M = 4.36). Staged animation was generally preferred over direct, and both over static. Heavily staged stacked-bar and donut transitions were the exceptions. — [Heer & Robertson 2007 PDF](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)
- [EVIDENCE-derived design rules] Heer & Robertson's principles:
  - Congruence: keep intermediate frames valid graphics, keep mappings consistent, and never reuse a mark for a different data point.
  - Apprehension: group similar transitions so viewers perceive common motion (Gestalt "common fate"), minimize occlusion, make motion predictable with slow-in/slow-out, prefer translation and expansion over rotation, and stage complex transitions.
  - Timing: transitions should be "as long as needed but no longer", with about 1 s as a target for data-graphics transitions.
  - Source: [Heer & Robertson 2007 PDF](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)
- [EVIDENCE, cited in Heer & Robertson] Earlier work:
  - Bederson & Boltman (1999): animated transitions in a family-tree explorer improved subjects' ability to rebuild the tree from memory.
  - Robertson et al. (1991, Cone Trees): used animated rotation to bring selected items into view.
  - Baudisch et al. (Phosphor, 2006): cited with Tversky as arguing for static depictions of change, and noting that overly slow transitions cause problems.
  - Source: [Heer & Robertson 2007 PDF](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)
- [EVIDENCE, review] Tversky, Morrison & Bétrancourt (2002), "Animation: can it facilitate?" (*IJHCS*):
  - Congruence Principle: "the structure and content of the external representation should correspond to the desired structure and content of the internal representation."
  - Apprehension Principle: the representation "should be readily and accurately perceived and comprehended." Animations are often too fast or too complex to follow accurately, and people break continuous events into discrete steps.
  - Source: [Tversky et al. 2002 PDF](https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf)
- [EVIDENCE, review] Tversky et al. 2002 on the evidence for animation:
  - Many studies showing a benefit compared animated graphics with static ones that carried less information, or bundled animation with interactivity. As they put it, "the animated graphics present information not available in the static versions."
  - Interactivity, such as control over speed, pause and replay, "may be the key to overcoming the drawbacks of animation."
  - The most promising use is conveying real-time changes in space, such as navigation views in interfaces, which had been little tested.
  - Source: [Tversky et al. 2002 PDF](https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf)
- [STANDARD] Humans are "exceptionally good at tracking motion" and dislike animations that aren't smooth, hence the 16 ms per-frame budget. — [web.dev, RAIL](https://web.dev/articles/rail)

### Inferences
- Attention capture comes from onset, not from continuous motion. So brief, start-of-change motion works for feedback such as a toast entering or a badge appearing. Continuous ambient motion like looping shimmers or auto-carousels may not keep attention, yet it still costs accessibility and battery. Its distraction cost is an inference here, not tested by Abrams & Christ.
- In practice, "common fate" means elements that belong together should move together (same direction, timing and easing). Staggering (section 4) deliberately breaks common fate to signal order or hierarchy.
- Spatial transitions (navigation, zoom, parent to child) are where both the evidence (Heer & Robertson, Bederson & Boltman) and the skeptics (Tversky) agree animation is most justified.

### Gaps
- I found no source for Weber/Fechner applied to UI duration perception, for apparent motion (phi/beta) thresholds in UI frame rates, or for change-blindness studies tied directly to UI transitions. These are commonly invoked, but I have no primary UI study to cite. The classic perception literature (Rensink et al. 1997 flicker paradigm; Wertheimer 1912 on apparent motion) was not retrieved.
- Visual tracking limits: Heer & Robertson tested only 2 targets. The multiple-object-tracking literature (Pylyshyn & Storm 1988, roughly 4–5 objects) was not retrieved.

## 3. Disney's 12 principles applied to UI (via Chang & Ungar 1993)

### Takeaway
Chang & Ungar (1993) is the main peer-reviewed bridge from Thomas & Johnston's Disney principles to interfaces. They regroup them into Solidity, Exaggeration and Reinforcement. In UI the most transferable principle is slow-in/slow-out (easing), followed by anticipation, follow-through and arcs. Squash and stretch gets only marginal treatment.

### Cited Findings
- [EVIDENCE/design paper] Chang & Ungar's three groups:
  - Solidity: "Characters and objects in cartoons are solid."
  - Exaggeration: "Cartoon animation does not merely mimic reality."
  - Reinforcement: subtle effects that are "in effect subliminal."
  - Source: [Chang & Ungar 1993](https://bibliography.selflanguage.org/_static/animation.pdf)
- Techniques in Chang & Ungar:
  - Motion blur (Solidity): needed "if an object moves more than half its size" between frames.
  - Slow in and slow out (Reinforcement): "characters move out of a pose slowly, then quickly during the bulk of the entire movement."
  - Anticipation (Exaggeration): "small, quick contrary movement" before the main move.
  - Follow-through (Reinforcement): "Objects coming to a stop will wiggle at the end of their motion."
  - Arcs (Reinforcement): "objects move along gentle curves when they are moving noninteractively."
  - Source: [Chang & Ungar 1993](https://bibliography.selflanguage.org/_static/animation.pdf)
- Squash and stretch is not developed as a UI technique in Chang & Ungar. It appears only in a summary table: objects "may squash and stretch, but always maintain their connectedness and weight." — [Chang & Ungar 1993](https://bibliography.selflanguage.org/_static/animation.pdf)
- Willenskomer distinguishes Disney's principles, which produce "more appealing animations", from his UX principles, which produce "more usable experiences." — [UX Magazine, UX in Motion Manifesto](https://uxmag.com/articles/creating-usability-with-motion-the-ux-in-motion-manifesto)
- [EVIDENCE] Heer & Robertson apply slow-in/slow-out as a predictability (apprehension) device and avoid rotation. Their staging matches Disney's "staging" principle, applied to data. — [Heer & Robertson 2007](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)

### Inferences
- In UI, follow-through and overshoot are usually built with an underdamped spring rather than hand-keyed (see section 6). Anticipation fits rarely, because adding a contrary move before a user-initiated response delays the response itself.
- Arcs fit non-interactive motion (Chang & Ungar's wording). Direct manipulation should track the finger 1:1 instead (section 6).

### Gaps
- I did not retrieve the primary text of Thomas & Johnston, *The Illusion of Life* (1981). The full list of 12 and its definitions is not cited here from a primary source. Secondary and timing principles are not covered by a retrieved UI source.
- I found no controlled study isolating the effect of any single Disney principle, other than easing (Heer & Robertson's design used slow-in/slow-out but did not test it separately), on UI usability.

## 4. Issara Willenskomer's "UX in Motion Manifesto" (12 principles) plus choreography, staggering and hierarchy

### Takeaway
Willenskomer's 12 principles reframe motion as a usability tool rather than a "final lipstick pass." They are organized around four jobs: expectation, continuity, narrative and relationship. They are practitioner doctrine, widely adopted, but not empirically validated as a set.

### Cited Findings
- [PRACTICE] The 12 principles:
  1. Easing: matches user expectation of how objects behave.
  2. Offset & Delay: staggered timing signals how new elements relate and rank.
  3. Parenting: linking one object's properties to another shows their relationship.
  4. Transformation: one object morphs through states toward an outcome.
  5. Value Change: animating numbers or text shows that data is live.
  6. Masking: revealing or concealing part of an object changes its function.
  7. Overlay: shows the z-order of layered objects.
  8. Cloning: new objects emerge from existing ones, showing cause and effect.
  9. Obscuration: blur or opacity signals a secondary context behind the main one.
  10. Parallax: different speeds convey depth and priority while scrolling.
  11. Dimensionality: 3D-like origin and departure points keep spatial orientation.
  12. Dolly & Zoom: camera-style moves keep continuity across views.
  - Source: [UX Magazine, Creating Usability with Motion: The UX in Motion Manifesto](https://uxmag.com/articles/creating-usability-with-motion-the-ux-in-motion-manifesto)
- [PRACTICE] The four ways motion supports usability:
  - Expectation: closing the gap between what users expect and what they experience.
  - Continuity: within a scene (intra) and across scenes (inter).
  - Narrative: a linear temporal and spatial framework.
  - Relationship: spatial, temporal and hierarchical links between objects.
  - Source: [UX Magazine](https://uxmag.com/articles/creating-usability-with-motion-the-ux-in-motion-manifesto)
- Key quotes:
  - "UI Animation is to the '12 UX in Motion Principles' as construction is to architecture."
  - On easing: "when to use easing? Always."
  - He criticizes the view of animation as a "final lipstick pass."
  - Source: [UX Magazine](https://uxmag.com/articles/creating-usability-with-motion-the-ux-in-motion-manifesto)
- [EVIDENCE link] Several Willenskomer principles line up with tested findings:
  - Transformation and Dolly & Zoom correspond to staged animated transitions, which reduced tracking error.
  - Offset & Delay corresponds to staging complex transitions.
  - Source: [Heer & Robertson 2007](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)

### Inferences
- Staggering (Offset & Delay) deliberately breaks "common fate" grouping to communicate order or rank. Heer & Robertson's mixed staging results (it helped Zoom & Filter, hurt Timestep Scatter Plot, and heavily staged donut and stacked bars were disliked) suggest staggering should be short and used only when the sequence carries meaning.
- Parallax (principle 10) conflicts with accessibility guidance, which lists parallax as a vestibular trigger (section 7).

### Gaps
- I found no peer-reviewed validation of the manifesto as a framework.
- Dan Saffer's *Microinteractions* (2014) model (trigger, rules, feedback, loops & modes) was not retrieved from a primary source. It appears only as a reference in NN/g's animation-duration sources ([NN/g](https://www.nngroup.com/articles/animation-duration/)).

## 5. Timing and easing: concrete numbers

### Takeaway
The practitioner consensus is: most UI animation runs 100–500 ms, with simple feedback around 100 ms, modals 200–300 ms, and large moves at most about 400 ms. Exits run slightly shorter than entrances. Ease-out is the default. Shorter is better for anything frequent. These numbers are guidance, not results from controlled studies. Data-visualization transitions tested in research ran longer, 1–2 s.

### Cited Findings
- [PRACTICE] NN/g guidance:
  - Most animations should take 100–500 ms. Find "the shortest time that an animation can take without being jarring."
  - About 100 ms for checkboxes and toggles, which "feels immediate."
  - 200–300 ms for substantial changes such as a modal.
  - Up to about 400 ms "only for big movements."
  - 500 ms and up "start to feel like a real drag."
  - Source: [NN/g, Executing UX Animations: Duration and Motion Characteristics](https://www.nngroup.com/articles/animation-duration/)
- [PRACTICE] Entrances should run "subtly longer" than exits, e.g., 300 ms to appear and 200–250 ms to disappear. Hover previews should be slightly delayed, while hover-state indicators respond very fast. — [NN/g](https://www.nngroup.com/articles/animation-duration/)
- [PRACTICE] Easing: linear looks unnatural. Ease-out is the most common choice because it starts fast and feels responsive. Ease-in or ease-in-out are sometimes used for exits, but "can feel unresponsive if the initial motion takes a little while to get going." Document animations as a timeline with milliseconds and a curve per element, not as an exported video. — [NN/g](https://www.nngroup.com/articles/animation-duration/)
- NN/g gives no specific studies for these durations. They are presented as design guidance. — [NN/g](https://www.nngroup.com/articles/animation-duration/)
- [PRACTICE] Emil Kowalski: outside marketing sites, UI animation should generally stay under 300 ms. A 180 ms dropdown feels more responsive than a 400 ms one. — [emilkowal.ski, You don't need animations](https://emilkowal.ski/ui/you-dont-need-animations)
- [EVIDENCE] The data-graphics transitions tested in research used 1.25 s (tracking) and 2 s (value estimation), with about 1 s suggested as the target. — [Heer & Robertson 2007](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)

### Inferences
- There are two regimes. Interface-chrome transitions (menus, modals, toggles) run about 100–300 ms. Comprehension transitions (data changing, large spatial reorientation) can justify about 1 s, because the user needs to track identity. The 100–500 ms rule applies to the first.
- Ease-out fits the response-time evidence. The large early displacement puts visible change inside the 100 ms "instant" window even when the total duration is longer.

### Gaps
- I found no controlled study establishing optimal UI durations by element size or distance. Material Design's and Apple HIG's specific duration tables were not retrieved.

## 6. Physics-based motion: springs vs. Bézier, interruptibility, velocity hand-off, momentum, rubber-banding

### Takeaway
Apple's "Designing Fluid Interfaces" (WWDC 2018) is the canonical practitioner source. Fluid interfaces are "responsive, interruptible, and redirectable." Springs are configured by damping and response rather than a fixed duration. Gesture velocity is handed off as the spring's initial velocity. Momentum is projected using the scroll deceleration rate. Rubber-banding uses a sub-linear function of the overscroll offset.

### Cited Findings
- All source notes below come from a third-party summary of the WWDC 2018 talk, not a direct transcript: [Nathan Gitter, "Building Fluid Interfaces" (Medium)](https://medium.com/@nathangitter/9732bb934bf5). Original talk: Apple WWDC 2018 session "Designing Fluid Interfaces" (not fetched).
- [PRACTICE] Interruptibility: springs spend much of their time near their final value, so users think the animation has finished and interact again. Animations must therefore be stoppable mid-flight, e.g., tapping a moving drawer pauses it.
- [PRACTICE] Velocity hand-off: convert the gesture velocity into a relative velocity (velocity divided by remaining distance), computed per axis, and use it as the spring's initial velocity so the animation continues at the finger's speed.
- [PRACTICE] Spring parameters: damping controls bounce and response controls speed.
  - Mapping: mass = 1, stiffness = (2π / response)², damping coefficient = 4π × dampingRatio / response.
  - A damping of 1 gives no bounce, and most animations should use it.
  - "Avoid forcing a duration on springs."
  - Examples: flashlight button 0.4 / 0.2; drawer 0.8 / 0.3; rotation 0.8 / 0.4; PiP 1 / 0.4 (damping / response).
- [PRACTICE] Momentum projection: projected distance = (velocity / 1000) × d / (1 − d), where d is UIScrollView's deceleration rate. This reuses scrolling muscle memory, and the projected endpoint picks the target (e.g., the nearest PiP corner). Flicks get bounce, taps don't.
- [PRACTICE] Rubber-banding: a simple approximation is offset^0.7. Any exponent between 0 and 1 makes movement shrink with distance. The desynced tracking itself signals the boundary.
- [PRACTICE] Hysteresis example: the flashlight force-press activates at 0.5, confirms at 0.49 and resets at 0.4, to prevent rapid toggling.

### Inferences
- Springs versus Bézier curves: a Bézier curve has a fixed duration and no notion of initial velocity. When a gesture interrupts it, it either jumps or restarts from zero velocity, which breaks object constancy (Chang & Ungar) and the direct-manipulation feel (0.1 s limit). A spring carries current position and velocity into a new target, which is why it suits gesture-driven and interruptible UI.
- An underdamped spring (damping below 1) is the physical version of Disney's follow-through. Apple's advice to default to critical damping mirrors NN/g's warning that exaggerated motion gets annoying with repetition.

### Gaps
- I found no peer-reviewed study comparing perceived quality or usability of spring versus Bézier motion. The superiority of springs is [PRACTICE] (strong industry consensus).
- Primary Apple documentation (the WWDC video or transcript, SwiftUI `.spring(response:dampingFraction:)` docs) was not fetched. Rauno Freiberg's "Invisible details of interaction design" and Josh Comeau's spring articles were not retrieved.

## 7. Perceived speed: progress bars and skeleton screens

### Takeaway
How a progress bar moves and looks changes how long the wait feels (Harrison et al. 2007, 2010). Skeleton screens are recommended for full-page loads of about 1–10 s, but the NN/g guidance rests mostly on practice, citing a single study (Mejtoft et al. 2018) whose results it does not report.

### Cited Findings
- [EVIDENCE] Harrison, Amento, Kuznetsov & Bell (2007, UIST), "Rethinking the Progress Bar": real processes speed up, slow down and pause, and humans perceive time non-linearly, so the same duration can feel faster or slower depending on how the bar moves. An experiment classified progress behaviors as perceptually speeding up or slowing down a process. — [chrisharrison.net, Progress Bars](https://chrisharrison.net/index.php/Research/ProgressBars); [CMU KiltHub](https://kilthub.cmu.edu/articles/journal_contribution/Rethinking_the_Progress_Bar/6470396/1)
- [EVIDENCE] Harrison, Yeo & Hudson (2010), "Faster Progress Bars: Manipulating Perceived Duration with Visual Augmentations," CHI '10, pp. 1545–1548: compared the perceived duration of visual styles head to head, then measured the improvement over a standard solid bar. — [chrisharrison.net, Progress Bars 2](https://chrisharrison.net/index.php/Research/ProgressBars2); [FIGLAB](https://www.figlab.com/research/2010/faster-progress-bars)
- [PRACTICE] NN/g's indicator rules:
  - Under 1 s: no indicator, since a quick flash can feel jarring.
  - Under 10 s: a skeleton screen for full-page loads, or a spinner for a single module.
  - Over 10 s: a progress bar, because "Anything above 10 seconds requires an explicit estimation of duration."
  - Downloads, uploads and conversions: a progress bar.
  - Source: [NN/g, Skeleton Screens 101](https://nngroup.com/articles/skeleton-screens/)
- [PRACTICE] Skeleton screen types:
  - Static: the most common, and it suggests the page's hierarchy.
  - Animated (pulse, shimmer): can be distracting or cause accessibility problems.
  - Frame-display (header and footer only): not recommended, because users may think the page is broken.
  - Claimed benefits: reassurance, a shorter-feeling wait, and lower cognitive load from forming a mental model early.
  - The article cites Mejtoft, Långström & Söderström (2018), "The effect of skeleton screens" (ECCE '18), but reports no data from it.
  - Source: [NN/g](https://nngroup.com/articles/skeleton-screens/)
- [PRACTICE] "Progress bars make waits more tolerable, regardless of how accurate they are." — [Laws of UX](https://lawsofux.com/doherty-threshold/), which points to Brad A. Myers, "The importance of percent-done progress indicators for computer-human interfaces" (CHI '85, not retrieved).

### Inferences
- The indicator thresholds line up with Nielsen's limits: no indicator under 1 s, indeterminate under 10 s, determinate over 10 s.
- NN/g's warning about shimmer and pulse animation sits alongside Abrams & Christ: continuous motion does not capture attention any better, so a static skeleton may do the job with less accessibility cost. This is an inference.

### Gaps
- I could not retrieve the specific quantitative results of the Harrison papers (which behaviors won, participant numbers, effect sizes). My training knowledge says the 2007 paper found accelerating, end-weighted progress preferred and the 2010 paper found backwards-moving ribbing perceived as about 11% faster, but I did not verify either in fetched text. Do not report them without checking the PDFs.
- I found no data from Mejtoft et al. (2018). Other skeleton-vs-spinner studies were not retrieved, so the skeleton-screen benefit is under-evidenced in these notes.

## 8. When motion hurts: frequency of use, distraction, cognitive load, vestibular disorders

### Takeaway
Motion has costs. It captures attention at onset (a distraction risk), it becomes annoying with repetition, it slows down keyboard-driven and high-frequency actions, and it can cause dizziness, nausea and migraine for people with vestibular disorders. WCAG 2.3.3 (AAA) requires that interaction-triggered motion can be disabled, and `prefers-reduced-motion` is the standard technique for that.

### Cited Findings
- [PRACTICE] Frequency rule:
  - Animations users see many times a day should be removed or minimized. The Raycast menu, used hundreds of times a day, works best with no animation, and hover effects used several times a day also benefit from none.
  - Delight works only on rarely seen components.
  - Don't animate keyboard-initiated actions: they "feel slow, delayed, and disconnected."
  - Once one tooltip is open, neighbors should open with no delay and no animation.
  - Source: [Emil Kowalski, You don't need animations](https://emilkowal.ski/ui/you-dont-need-animations)
- [PRACTICE] The more often an animation is seen, the shorter and subtler it should be. NN/g's Seamless cart example is "very likely to be annoying with repetition." — [NN/g, Animation duration](https://www.nngroup.com/articles/animation-duration/)
- [EVIDENCE] Animations are often too fast or too complex to perceive accurately, which fails the Apprehension Principle. Overly slow transitions also cause problems (Baudisch et al., cited in Heer & Robertson). — [Tversky et al. 2002](https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf); [Heer & Robertson 2007](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)
- [EVIDENCE] The onset of motion captures attention even when it is task-irrelevant. — [Abrams & Christ 2003](https://pubmed.ncbi.nlm.nih.gov/12930472/)
- [STANDARD] WCAG 2.1 SC 2.3.3, Animation from Interactions (Level AAA): motion animation triggered by interaction "can be disabled," unless it is essential.
  - Vestibular reactions include "dizziness, nausea and headaches", migraines, and sometimes a need for bed rest.
  - Named triggers: parallax scrolling, and decorative movement driven by scrolling.
  - Techniques: C39 (CSS `prefers-reduced-motion`), SCR40 (the same query in JavaScript), and a user-facing setting that prevents animation.
  - The page cites no prevalence figures.
  - Source: [W3C, Understanding SC 2.3.3](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html)
- [PRACTICE] Respect "reduce motion", avoid flashing and hard color cuts (seizure risk), and be cautious with parallax and scroll-jacking. — [NN/g](https://www.nngroup.com/articles/animation-duration/)

### Inferences
- A workable decision rule follows from these sources. Animate only when the motion explains something (a spatial relationship, cause and effect, or a state change) or confirms an action. Shorten or drop it as frequency rises. Never put it on keyboard paths. Swap spatial motion for an opacity fade, or nothing, under `prefers-reduced-motion`.
- Parallax (a Willenskomer principle) and animated skeleton shimmer are both flagged as accessibility risks by standards bodies or NN/g. They are the first candidates to disable under reduced motion.

### Gaps
- I found no reliable prevalence figure for vestibular disorders in the W3C source. Commonly quoted figures (e.g., "35% of adults over 40", from Agrawal et al. 2009 on vestibular dysfunction) were not retrieved and must be verified before use.
- I found no controlled study measuring cognitive load (e.g., NASA-TLX) for UI chrome animation versus none in high-frequency tasks. The frequency rule is [PRACTICE].
