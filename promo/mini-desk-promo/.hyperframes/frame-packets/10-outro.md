# Frame packet: 10-outro

## Project inputs

- Project: /Users/xiangjianan/github/todolist/promo/mini-desk-promo
- Design tokens: /Users/xiangjianan/github/todolist/promo/mini-desk-promo/frame.md
- RULES_DIR: /Users/xiangjianan/.claude/skills/hyperframes-animation/rules

## Assigned storyboard block

## Frame 10 — Do less, do it well

- scene: aurora 辉光中 logo 组装定版，slogan「Do less, do it well.」与 minidesk.online 逐字落定，URL 药丸最后弹现
- voiceover: "Do less, do it well——现在就打开 minidesk.online。"
- duration: 5.904s
- transition_in: crossfade
- status: built
- src: compositions/frames/10-outro.html
- type: cta
- persuasion: 品牌格言收束 + 单一明确行动点
- beat: 余韵 → 行动
- asset_candidates: assets/logo.png — 定版 lockup
- blueprint: logo-assemble-lockup (Adapt — text-clear bloom 味)
- focal: assets/logo.png
- roles: logo.png = cutout（定版主角）
- sfx: bloom（logo 绽出）、chime-soft（URL 药丸落定）

Adapt: 保留「标记从无到有 → 收束成居中 lockup → 末段长静置」骨架，取 text-clear bloom 变体；变化——前序不是文字拍而是 blur-crossfade 直接进空台，slogan 逐词落定替代 wordmark 逐字（中文不拆字距）。
Scene 1 (0.0–1.2s): blur-crossfade 退净后空台一拍，aurora 升到全片最亮（三色辉光中位聚拢——`ambient-glow-bloom` 预热）。
Scene 2 (1.2–2.8s): VO「Do less, do it well」——logo **spring-bloom from zero**（`spring-pop-entrance` 弹性豁免二，带轻微旋入）正中绽出；「Mini Desk」字标 **slide-out-from-behind**（x 位移 + clip 遮罩，logo 压字 z 序）从右侧拉出，lockup 居中成立。
Scene 3 (2.8–4.4s): slogan「Do less, do it well.」**左→右 wipe-in**（clip-path `inset()`）落定于字标下方；VO「现在就打开」——URL 药丸「minidesk.online」**pop** 落定于最底（仍在 caption 线之上），primary 描边 + 辉光 halo 晚一拍（`ambient-glow-bloom`）。
Scene 4 (4.4–6.0s): 死静置 hold（≥26%）——lockup 即终点，全片最后一帧不动。

narrativeRole: 品牌哲学收束并给出唯一行动：打开网址。
keyMessage: 打开 minidesk.online。

## Selected blueprint: logo-assemble-lockup

# logo-assemble-lockup — Logo Assemble → Lockup

**intent**: A brand mark / wordmark comes to exist on screen and resolves into a centered logo lockup — built from parts (elements assemble or orbit in, letters cascade, an outline draws on, or a camera pushes through negative space), spring-BLOOMED whole from zero on a cleared stage, MORPHED in one unbroken chain out of the preceding phrase / glyph, absorbed from a kinetic streak, or already assembled and settling as decorations clear — optionally extended into a final URL / CTA / end card.

**roles served**

- Product_Intro (from product-intro-logo-system-assemble): A wordless, premium brand STING — an abstract system of elements pulses / grows / orbits and assembles around a FIXED central logo, carried by one cinematic camera tilt; no copy, no UI.
- CTA (from cta-camera-push-lockup): The logo build is a LEAD-IN to the final ask — a 3D mark assembles + wordmark cascades, then a fast camera PUSH-THROUGH the mark's negative space streaks giant CTA letters past the lens and resolves on a `[url]` / `[CTA verb]` lockup.
- CTA (from cta-button-wordmark-build): The "draws-its-own-outline → wordmark-builds-letter-by-letter" sub-shape — a `[CTA button]` pill strokes its own glowing border, a diagonal-band WIPE flips the frame, and the `[wordmark]` types in beside a slash to land the lockup. Camera static.
- Brand_Outro (from brand-outro-assemble-logo-lockup): The closing mark — a formation of `[feature pills / UI elements]` CLEARS the stage off all four edges, then on the empty frame the `[logo mark]` draws itself on stroke-by-stroke and the `[wordmark]` reveals to complete the lockup, then fades out.
- Product_Intro (from brand-reveal-assemble-zoom): a context-then-focus reveal — a companion tagline TYPES out to set context, the hero mark pops in beside it, then the companion exits as the layout recenters and the camera pushes IN to a held close-up on the mark (wide composition narrowing to a tight focus).
- Product_Intro (from logo-parts-lockup-assembly): the literal parts build — `[icon parts]` (a glowing dot traces a circle, semi-circles scale up and overlap, strokes rotate in) converge into the `[brand icon]` center-frame on a flat / gradient field, the `[wordmark]` joins (± a `[badge pill]` pops onto the lockup), then a payoff beat: a stepped bottom `[subtitle rail]`, a big `[count-up stat]` over a faint asset grid, or the lockup clears and a `[product UI window]` scales in. Static frame, all element-level.
- CTA (from text-clears-mark-blooms-lockup): the text-clear BLOOM — centered `[serif tagline]` beats (word-by-word staggered fades) hold, then CLEAR themselves to a blank frame; the `[brand mark]` spring-blooms from ZERO at dead center, slides left as the `[wordmark]` reveals to its right, and the balanced lockup holds (near-)still. Constant warm flat bg, static frame.
- Brand_Outro (from phrase-morphs-into-lockup): the MORPH chain — a centered `[phrase]` mutates in place, then collapses / swaps into an `[intermediate glyph]` whose line panels fan-and-flip around a central pivot with visible motion blur (page-flip feel) and interlock into the `[geometric mark]`, which slides apart into the lockup. One unbroken chain of transformation, never a cut-and-replace assembly; the finished lockup holds dead static for the final ~40–50% of runtime.
- Brand_Outro (from lead-text-then-mark-assembles): the parts-arrive build — a `[hand-off line]` holds and departs, then the mark is BUILT from arriving parts (`[icon]` drops in, letters slide in one by one, terminal punctuation lands, a confetti burst pops and instantly shrinks) OR a `[pixel stack]` streaks into full-width multicolor stripes whose tail retracts and is ABSORBED into the pixel mark — finishing as a lockup or a full end card (`[icon tile]` + `[title]` + `[URL pill]` + store badges) held static.
- Brand_Outro (from `settled-lockup-reveal`): the null-assembly boundary — the `[lockup]` is on stage from frame one; `[satellite shapes]` drift outward and fade, an accent underline sweeps beneath the wordmark, and the `[tagline]` wipes in to complete it. Settle-and-reveal: no predecessor beat, no morph, no relay.

**duration**: ~4.4–11.0s (Brand_Outro ~4.4–7.3s · brand-reveal ~5s · CTA text-clear bloom 6.0–8.9s · Product_Intro ~7s orbit sting, 7.0–9.8s parts-assembly · CTA push/build 5.4–11.0s)

**shot structure** (one consolidated time-coded template; `[slots]` are product-agnostic)

- Scene 1 — clear / ignite (0.0–~1.0s): the stage is prepared for the mark to build into.
  - _Variant — Product_Intro_: opens on a clean `[light bg]` with faint concentric guide rings under a flat top-down view; rings PULSE and expand from center; mid-beat the bg crossfades `[light]→[dark gradient: hero→secondary]`, tiny seed dots appear along the rings, and the central `[logo mark]`'s glow IGNITES (mark is present from t=0, fixed, front-facing).
  - _Variant — CTA push_: on a `[bg gradient]`, the `[logo mark]` is settling in object space (a 3D mark with thin wireframe edge-guides + a faint bracket motif behind center); a very slow continuous camera push-in may already be creeping.
  - _Variant — CTA button-build_: on a `[dark grid bg]`, a rounded `[CTA button "label"]` pill rises / scales into center (a prior headline clearing off the top); its thin border DRAWS ON as an animated glowing outline STROKE, with a small `[accent]` comet / spark icon at its left edge.
  - _Variant — Brand_Outro_: a PRE-ARRANGED formation of `[feature pills / element grid]` (each `[icon]`+`[label]`) DISPERSES — elements slide outward from their laid-out positions and fly off all four frame edges (edge-clearing drift, NOT a center-origin burst), emptying the frame onto a clean `[bg]`.
  - _Variant — Product_Intro parts-assembly_ (from logo-parts-lockup-assembly): optional text hook — a centered "`[Meet product]`" line wipes away right→left — or straight into the build; on a flat / gradient `[bg]`, the first `[icon parts]` arrive: a glowing dot traces a clockwise circle, a gradient semi-circle scales up inside it, or the mark scales-up-with-rotate into center.
  - _Variant — CTA text-clear bloom_ (from text-clears-mark-blooms-lockup): a centered `[serif tagline / question]` (± an outlined `[badge pill]`) finishes a left→right word-staggered reveal in the first ~0.5–1s (each word passing light-grey→dark) and HOLDS; optional rolling word-by-word swap to a second `[availability line]`. Then the CLEAR: text exits — shrink-toward-center + fade, or word-by-word left-first fade-out — leaving a blank frame for a beat.
  - _Variant — Brand_Outro morph-chain_ (from phrase-morphs-into-lockup): a centered `[phrase]` completes or mutates in place (a vertical slot-machine word swap — one word exits up as its replacement rises from below, rest of the line fixed — or a word-by-word landing) and holds. Nothing clears: the phrase IS the raw material for the mark.
  - _Variant — Brand_Outro parts-arrive_ (from lead-text-then-mark-assembles): a centered `[hand-off line: tagline / "Brought to you by"]` holds on a flat canvas, then exits — slides straight down off-frame with fade, or fades away behind the incoming flourish.
  - _Variant — Brand_Outro settled-reveal_ (from settled-lockup-reveal): the `[lockup]` is already centered at t=0; `[satellite shapes]` drift slowly outward around it — an INVERTED clear: the decorations leave, the mark stays.

- Scene 2 — assemble the mark (~1.0–~Ys): the mark builds itself from parts.
  - _Variant — Product_Intro_: seed dots SCALE UP into flat `[accent]` shapes arranged on the rings; concentric bands ripple outward (tunneling feel) and the shapes begin to ORBIT / drift around the still-fixed center.
  - _Variant — CTA push_: the `[wordmark]` CASCADES out from behind the mark (letters left→right with overshoot) into the full `[brand lockup]`; the 3D mark may assemble in beats (a terminal detaches + pops as a spring dot, a part hinges-open-and-snaps-shut elastic). Optional beat: a `[cursor]` arcs in and "clicks" the wordmark, OR a frosted-glass pill holding an intermediate `[CTA line]` springs in while layered mark shells fan to the edges.
  - _Variant — CTA button-build_: a graphic WIPE flips the frame to `[contrast bg]` — a thin `[accent]` diagonal line sweeps in, swells into a full-frame diagonal BAND, then collapses to a small `[accent]` slash.
  - _Variant — Brand_Outro_: on the now-clear frame, the `[logo mark]` DRAWS ON via stroke (built arc-by-arc / segment-by-segment).
  - _Variant — Product_Intro parts-assembly_: the overlapping parts COMPLETE the `[brand icon]` (a second circle overlaps to close the orb; strokes interlock); the `[wordmark]` slides out from behind the icon or in from its right; a small `[badge pill]` pops onto the lockup.
  - _Variant — CTA text-clear bloom_: on the blank frame the `[brand mark]` scales up from ZERO at dead center with a snappy spring ease (slight overshoot, hint of rotation as it grows) — the whole mark at once, no parts.
  - _Variant — Brand_Outro morph-chain_: the phrase collapses / wipes horizontally into the mark, OR is instantly swapped at the same center for a line-art `[intermediate icon]` whose strokes split into panels that fan-and-flip around a central pivot with visible motion blur, interlock-settling into the `[geometric mark]`. Never a cut to the finished logo — the transformation must stay unbroken.
  - _Variant — Brand_Outro parts-arrive_: the mark is BUILT from arriving parts — the `[icon]` drops in from above, letters slide in one by one, terminal punctuation lands, a tiny confetti burst pops and instantly shrinks — OR a colored `[pixel stack]` pops in at a text edge, shoots horizontally stretching into full-width multicolor stripes, then the stripe tail retracts and is ABSORBED into the `[pixel mark]` (mask retraction).
  - _Variant — Brand_Outro settled-reveal_: an accent underline sweeps left→right beneath the `[wordmark]` — the only "build" this variant performs.

- Scene 3 — resolve to lockup (~Ys–end): the lockup completes and holds (Product_Intro / Brand_Outro) or is flown into / extended to a CTA (CTA variants).
  - _Variant — Product_Intro (the ONE camera move)_: the whole system smoothly TILTS from flat top-down into an angled isometric perspective (ease-in-out) with a slight zoom-out — flat shapes become luminous 3D forms, bands become glowing orbit lines, while the central `[logo mark]` does NOT tilt (stays 2D, front-facing, fixed). Camera eases to a stop; elements keep continuous orbit/drift (inner faster than outer); the mark holds its steady glow. Final settled frame.
  - _Variant — CTA push (the signature)_: a single fast CAMERA PUSH-THROUGH the mark's negative space / through the glass pill — heavy horizontal motion-blur, giant `[CTA]` letters streaking past the lens (cursor drops out). Resolves to the final lockup on a saturated `[bg]`: a `[url badge]` / `[CTA line]` revealed by a left→right WIPE carrying an `[accent]` leading edge (or a clean fade), with solid mark-shapes parallax-sliding in behind. Settles to a dead-static hold (slow zoom-out / settle).
  - _Variant — CTA button-build_: the `[wordmark]` BUILDS letter-by-letter to the right of the slash, landing on the final "`[slash] [WORDMARK]`" lockup centered on the new bg. Slow settle to static.
  - _Variant — Brand_Outro_: the `[wordmark]` reveals beside the drawn mark (slide / fade) to complete the `[lockup]`; the lockup holds, then fades to `[black / bg]`.
  - _Variant — Product_Intro parts-assembly (the payoff beat)_: the finished lockup holds while a bottom `[subtitle box]` steps through `[tagline fragments]` (swap-in-place); or a big `[count-up stat]` line lands over a faint background asset grid; or the lockup scales-down / fades and a `[product UI window]` scales up on the flat bg (its panel content may swap once). The build hands off to product proof.
  - _Variant — CTA text-clear bloom_: the mark slides a short distance LEFT while the `[wordmark]` reveals to its right (letter-by-letter / slide-out wipe with visible partial states); the balanced "`[mark] + [wordmark]`" lockup centers and holds, one member continuing an almost imperceptible slow scale-up through the hold.
  - _Variant — Brand_Outro morph-chain_: the mark slides left as the `[wordmark]` is pulled out rightward trailing a motion-blur streak, the pair decelerating into the centered lockup (± a `[sub-line]` fades in below). The hold is LONG — dead static for the final ~40–50% of runtime.
  - _Variant — Brand_Outro parts-arrive_: the lockup rests centered and holds; or the full end card completes — a rounded-square `[icon tile]` scales up behind the mark, the `[title]` fades in word-by-word, and a bottom row (`[URL pill]` + `[store badges]`) fades / slides up — then holds static.
  - _Variant — Brand_Outro settled-reveal_: the `[tagline]` reveals left→right below the wordmark; the satellites finish drifting out and fade; the lockup holds centered (at most a very slow global zoom-out, no pan).

**motion vocabulary**: ring pulse / expand; background crossfade (light→dark); glow ignite; seed-dot scale-up; continuous orbit / drift (inner faster than outer); single 3D perspective tilt (flat→isometric) + slight zoom-out around a fixed 2D anchor; 3D logo assemble (part detach + spring dot, clapperboard hinge / snap, shell fan-out); wordmark cascade with overshoot (letters left→right); button pill rise / scale-in; animated stroke-outline DRAW + glow (button border AND logo mark); comet / spark accent; diagonal-band wipe (sweep → swell → collapse-to-slash); letter-by-letter wordmark build; pre-formed grid DISPERSE off all four edges; logo-mark stroke-draw (sequential arcs / segments); fast CAMERA PUSH-THROUGH with motion-blur (CTA spine); continuous slow push-in / push-out; cursor arc-in + click; parallax shape slide-in; left→right URL/badge wipe with glowing leading edge; static / fade-out end-lockup hold; optional idle breathe on the held mark; glowing-dot circular path trace; part-overlap icon completion (semi-circles scale up + overlap); scale-up-with-rotate mark entrance; wordmark slide-out-from-behind-icon; badge pill pop onto the lockup; stepped subtitle swap-in-place (bottom rail); count-up stat tick over a faint asset grid; lockup shrink / fade → UI-window scale-up payoff; word-by-word staggered fade-through-grey (in, and left-first out); rolling word-by-word line swap; shrink-toward-center + fade clearing exit; whole-mark spring BLOOM from zero (overshoot + slight rotation); near-imperceptible continuous scale-up through the hold; vertical slot-machine word swap; horizontal phrase collapse / wipe into the mark; instant same-center text→icon swap; line-panel fan-and-flip morph around a central pivot with motion blur (page-flip feel); interlock-settle into the geometric mark; wordmark pull-out trailing a motion-blur streak; lead-line slide-down-off-bottom exit; icon drop-in from above; sequential per-letter slide-in + terminal punctuation landing; confetti burst pop-then-instant-shrink; pixel-stack pop at a text edge; horizontal streak-stretch into full-width stripes; stripe-tail retraction absorbed into the mark (mask retraction); rounded-tile scale-up enclosing the mark; bottom metadata row fade / slide-up (URL pill + store badges); satellite shapes outward drift + fade; left→right underline sweep; left→right tagline wipe-in.

**rule mapping** (per motion verb → `rules/<id>.md`)

- ring pulse / expand from center → `center-outward-expansion` (radiate from a shared center; reuse the 0→1 progress driver)
- background crossfade (light→dark gradient) → plain opacity/background tween via `gsap-effects` (no dedicated rule needed)
- glow ignite on the mark → `asr-keyword-glow` (envelope-driven glow on the brand element)
- seed-dot scale-up into shapes → `spring-pop-entrance` (scale-in pop; alt `scale-swap-transition` if dots morph into shapes)
- continuous orbit / drift around fixed center → `orbit-3d-entry` (flip-in then continuous elliptical orbit; center label = the fixed mark)
- single 3D perspective tilt (flat→isometric) + slight zoom-out → `multi-phase-camera` (scripted scale phases on a scene-wrapping camera, for the zoom-out) — see camera modifier; the FLAT→ISOMETRIC plane tilt of the whole stage is a CSS-3D perspective move (`techniques.md` CSS-3D, animating the stage's `rotateX`) — no exact camera rule for the plane-tilt, approximate via CSS-3D (closest reference is `orbit-3d-entry`'s "Tilted orbit plane" variation animated over time)
- fixed 2D anchor logo amid moving universe → no motion rule needed (static anchor; intentional — it's the absence of motion, the universe moves around it)
- 3D logo assemble — part detach + spring dot → `spring-pop-entrance` (spring pop, `back.out` overshoot)
- 3D logo assemble — hinge open / snap (clapperboard) → `hacker-flip-3d` (the 3D-rotate axis) + `techniques.md` CSS-3D (the elastic open-and-snap-shut hinge is an adaptation of the 3D-rotate)
- 3D logo assemble — shell fan-out to edges → `center-outward-expansion` (run outward from the mark center)
- wordmark cascade with overshoot (letters left→right) → recipe `gsap-effects` (per-element staggered slide) + `spring-pop-entrance` (the `back.out` overshoot per letter)
- button pill rise / scale-in → `spring-pop-entrance` (scale-in; alt `scale-swap-transition`)
- animated stroke-outline draw + glow (button border) → `svg-path-draw` (stroke-dashoffset draw) + `asr-keyword-glow` (the glow on the drawn stroke)
- comet / spark accent on button → `asr-keyword-glow` (small glow accent); motion path via `techniques.md` GSAP MotionPathPlugin (#9)
- diagonal-band wipe (sweep → swell → collapse-to-slash) → `techniques.md` clip-path reveal (#12, animate a `polygon(...)` diagonal across the frame; the swell-then-collapse-to-slash is the same clip-path reveal driven through grow→shrink keyframes)
- letter-by-letter wordmark build → `discrete-text-sequence` (smooth-slice / per-state build); recipe `gsap-effects` (typewriter / appending words)
- pre-formed grid disperse off all four edges → not a rule gap: a formation flying off-frame is an EXIT, and the pipeline forbids mid-video exits — the harness transition IS the exit (only the final frame may exit the stage). Treat this as transition-handled / final-frame-only rather than an in-scene motion rule. (If staged in-scene as a reveal-the-mark clear, it reuses `center-outward-expansion` run OUTWARD — center→target machinery interpolating formation→offscreen targets, out-easing.)
- logo-mark stroke-draw (sequential arcs / segments) → `svg-path-draw` (the canonical multi-segment stagger draw)
- wordmark slide / fade reveal beside drawn mark → `svg-path-draw` (its "brand-line fades in after stroke" tail) ; slide via `spring-pop-entrance`
- fast camera push-through with motion-blur → `multi-phase-camera` (a hard push phase) — see camera modifier; the heavy motion-blur streak itself → `motion-blur-streak` (directional velocity blur on the fast push-through)
- continuous slow push-in / push-out → `multi-phase-camera` (phase scale + drift)
- cursor arc-in + click on the wordmark → `cursor-click-ripple` (move → click → ripple); arc path via `techniques.md` MotionPathPlugin (#9)
- parallax shape slide-in behind lockup → `depth-scatter-assemble` (parallax depth slide-in of shapes at differing depths; pair with `3d-text-depth-layers` for the depth ordering)
- left→right URL / badge wipe with glowing leading edge → `techniques.md` clip-path reveal (#12, animate `inset()` left→right); the glowing leading edge → `asr-keyword-glow`
- static / fade-out end-lockup hold → no motion rule needed (terminal hold / opacity fade; intentional)
- idle breathe on held mark (optional) → `sine-wave-loop` (post-settle breathing)
- glowing-dot circular path trace → `svg-path-draw` (the traced circle draws on) + `techniques.md` MotionPathPlugin (#9) for the leading dot riding the path tip
- part-overlap icon completion / semi-circle scale-up → `spring-pop-entrance` (per-part scale-in; place parts at their final overlap positions from setup — the overlap IS the completed mark)
- scale-up-with-rotate mark entrance → `spring-pop-entrance` (add a rotation from-value to the pop)
- wordmark slide-out-from-behind-icon → recipe `gsap-effects` (x-slide) under a clip / overflow mask via `techniques.md` clip-path reveal (#12); z-order the icon above the sliding text
- badge pill pop onto the lockup → `spring-pop-entrance`
- stepped subtitle swap-in-place (bottom rail) → `discrete-text-sequence` (whole-state replacement at time thresholds); derive the windows via `dynamic-content-sequencing`
- count-up stat tick over a faint asset grid → `counting-dynamic-scale`; the faint grid is a plain opacity fade (no rule needed)
- lockup shrink / fade → UI-window payoff → `scale-swap-transition` (exit cluster shrinks + fades at center; window pops in with `back.out`)
- word-by-word staggered fade-through-grey (in / left-first out) → recipe `gsap-effects` (per-word staggered opacity + color tween). Deliberately a quiet FADE register — do NOT substitute `waterfall-entry` here; its binary-arrival doctrine is the wrong voice for this serif beat
- rolling word-by-word line swap → two overlapping `gsap-effects` word staggers at the same timeline position (old line out left-first, new line in left→right)
- shrink-toward-center + fade clearing exit → `scale-swap-transition` (its exit half; the entrance half is the bloom)
- whole-mark spring BLOOM from zero → `spring-pop-entrance` (single hero, `back.out` overshoot, slight rotation from-value)
- near-imperceptible continuous scale-up through the hold → no motion rule needed (one long linear micro-tween on the held lockup; intentional life-in-the-hold)
- vertical slot-machine word swap → `vertical-spring-ticker` (masked column, stepped tween — one word slot cycles, rest of the line fixed)
- horizontal phrase collapse / wipe into the mark → `scale-swap-transition` (same-center morph) with the collapse via `techniques.md` clip-path reveal (#12)
- instant same-center text→icon swap → no motion rule needed (`tl.set` hard swap; intentional — the chain's continuity lives in the NEXT beat's morph)
- line-panel fan-and-flip morph (page-flip, motion-blurred) → `hacker-flip-3d` (the per-panel 3D rotation axis) + `motion-blur-streak` (the blur) + `techniques.md` CSS-3D; true stroke-interpolation glyph morphs live in `hyperframes-keyframes` (SVG morph) — reach there if panels can't sell it
- interlock-settle into the geometric mark → `center-outward-expansion` machinery run INWARD (per-panel transform offsets tween to 0 in lockstep with one driver)
- wordmark pull-out trailing a motion-blur streak → `motion-blur-streak` (echo / ghost trail collapsing into the lead) on the x-slide
- lead-line slide-down-off-bottom exit → in-scene clearing beat; same doctrine as the grid-disperse row above (offscreen target + out-easing; prefer the harness transition when the exit IS the scene boundary)
- icon drop-in from above → `spring-pop-entrance` (y-offset from-value, overshoot on landing)
- sequential per-letter slide-in + terminal punctuation landing → `waterfall-entry` (staggered arrival cascade on a lateral axis; the punctuation is the cascade's final, heaviest beat)
- confetti burst pop-then-instant-shrink → `press-release-spring` ("release burst" variation) for a small deterministic burst; a true multi-particle confetti field → `particle-burst`
- pixel-stack pop at a text edge → `spring-pop-entrance` (tight stagger down the stack)
- horizontal streak-stretch into full-width stripes → plain `scaleX` stretch via `gsap-effects` (transform-origin at the stack) + `motion-blur-streak` for the streak read
- stripe-tail retraction absorbed into the mark → `techniques.md` clip-path reveal (#12) run in REVERSE (animated `inset()` retraction reading as mask absorption into the mark)
- rounded-tile scale-up enclosing the mark → `spring-pop-entrance` (scale-in BEHIND the mark; z-order only, mark never moves)
- bottom metadata row fade / slide-up → `spring-pop-entrance` (staggered group, ≤500ms cap)
- satellite shapes outward drift + fade → `center-outward-expansion` run OUTWARD (drift targets past frame edge) + opacity tail; if the drift must idle first, seed it with `sine-wave-loop`
- left→right underline sweep → `css-marker-patterns` (highlight sweep re-skinned as an underline) or `stat-bars-and-fills` progress-fill `scaleX`
- left→right tagline wipe-in → the existing "left→right URL / badge wipe" row applies unchanged (clip-path `inset()`)

**camera modifier** (the push / tilt)

- **CTA push-through** (the CTA spine): a scripted hard zoom phase on a scene-wrapping camera → `multi-phase-camera` ("Steady push" / "Bookend pull" pattern; push phase = the climax). When the mark is OFF-center and the camera must fly through a specific point of negative space, combine with `coordinate-target-zoom` (outer scales, inner counter-translates so the target negative-space point lands at viewport center as scale ramps; measure the offset at setup). The signature heavy horizontal MOTION-BLUR on the streak → `motion-blur-streak` (directional velocity blur on the push); realize with a CSS `filter: blur()` / duplicated-streak layer on the camera during the push window.
- **Product_Intro tilt** (the one cinematic move): the flat→isometric perspective tilt + slight zoom-out is a single scripted camera beat → `multi-phase-camera` (scale phase + the "Targeted zoom into off-center element" / drift machinery) for the zoom-out. `multi-phase-camera` is scale+translate+drift only, so the perspective-PLANE rotateX (flat top-down → angled isometric) of the whole stage is the CSS-3D move noted above — approximate via `techniques.md` CSS-3D, animating the stage's `rotateX` (closest reference is `orbit-3d-entry`'s "Tilted orbit plane" variation animated over time).
- **Static-frame variants**: the parts-assembly, text-clear bloom, morph-chain, parts-arrive, and settled-reveal variants are all COMPLETELY static-frame (element-level motion only; settled-reveal tolerates at most a very slow global zoom-out). The camera modifier applies only to the CTA push and the Product_Intro tilt.

## Selected motion rule: ambient-glow-bloom

---
name: ambient-glow-bloom
description: Un-triggered soft radial glow that blooms in behind a hero element and holds with a bounded idle breathe, or a single-pass traveling sweep across a surface. No click, no word-sync — it just blooms. Finite, deterministic, seek-safe.
metadata:
  tags: glow, bloom, ambient, radial, sweep, hero, presence, finite, un-triggered
---

# Ambient Glow Bloom

A soft radial glow that **blooms in behind a hero element** (card, logo, metric) and holds, giving it presence. Unlike `press-release-spring`'s click-triggered burst or `asr-keyword-glow`'s word-timed envelope, this glow is **un-triggered** — it blooms on the hero's settle and stays lit. Two forms: a **hero bloom** that swells behind a settling element then breathes, and a **traveling sweep** that translates a soft highlight across a surface exactly once.

## How It Works

A radial-gradient layer sits **behind** the hero (glow `z-index: 1`, hero `z-index: 2` — a glow in front occludes it), starting at `opacity: 0`. Over the bloom-in window it ramps `opacity: 0 → peak` with a gentle `scale` swell, timed so `BLOOM_START + BLOOM_DUR` lands on the hero's settle — glow and hero resolve as ONE beat ("powering on"), never glow-then-card. After bloom-in:

1. **Hero bloom** — a **bounded idle breathe** during the hold: a finite `ease: "none"` tween advances a `phase` proxy and `onUpdate` nudges opacity + scale a hair around peak (never a `yoyo` loop). `sin(0) = 0` → the breathe starts exactly at the bloom's resting state.
2. **Traveling sweep** — a narrow highlight band at one edge translates **once** across to the other (`x` off-surface to off-surface), clipped to the surface (`overflow: hidden`). One pass, no return — a repeating sweep reads as a loading shimmer, not a reveal accent (the shimmer-sweep variation below is the sanctioned exception).

Peak opacity stays restrained (**≤ 0.45 hard ceiling**) so the glow gives presence without washing the frame; the glow color is **darker + more saturated** than the element it backs (a same-hue, same-lightness glow disappears into the surface).

## Recipe

```html
<!-- inside a standard scene clip -->
<div class="bloom-stage">
  <div class="bloom-glow" id="bloom-glow"></div>
  <!-- z-index: 1; inset: GLOW_INSET (negative); background: {glowGradient} -->
  <div class="hero-card" id="hero-card">{HeroLabel}</div>
  <!-- z-index: 2 -->
</div>
<!-- sweep form: <div class="sweep" id="sweep"> inside the overflow:hidden surface -->
```

```js
// ── Form A: HERO BLOOM ── bloom in soft, landing on the hero's settle.
tl.fromTo(
  "#bloom-glow",
  { opacity: 0, scale: GLOW_START_SCALE },
  { opacity: GLOW_PEAK_OPACITY, scale: 1, duration: BLOOM_DUR, ease: "power2.out" },
  BLOOM_START,
);
// Bounded breathe during the hold — finite phase tween, NOT a yoyo loop.
const glow = document.getElementById("bloom-glow");
const phase = { p: 0 };
tl.to(
  phase,
  {
    p: Math.PI * 2 * BREATHE_CYCLES,
    duration: BREATHE_DUR,
    ease: "none",
    onUpdate: () => {
      const s = Math.sin(phase.p);
      glow.style.opacity = String(GLOW_PEAK_OPACITY + s * OPACITY_AMP);
      glow.style.transform = `scale(${1 + s * SCALE_AMP})`;
    },
  },
  BLOOM_START + BLOOM_DUR,
);

// ── Form B: TRAVELING SWEEP ── one finite pass, constant glide.
tl.fromTo(
  "#sweep",
  { x: SWEEP_START_X, opacity: 0 },
  { x: SWEEP_END_X, opacity: SWEEP_PEAK_OPACITY, duration: SWEEP_DUR, ease: "none" },
  SWEEP_START,
);
tl.to("#sweep", { opacity: 0, duration: SWEEP_FADE_DUR, ease: "power1.in" }, SWEEP_FADE_START);
```

## Variations

- **Bloom-and-hold** — for scenes <3s or a hero with its own idle, skip the breathe: the single `fromTo` is the whole recipe.
- **Pulse-on-arrival** — bloom slightly PAST peak (`GLOW_OVERSHOOT_OPACITY`, `scale: 1.06`), then a second adjacent tween eases down to a steady hold — one breath punctuating the landing, no ongoing loop.
- **Multi-hero relay** — stagger per-glow `BLOOM_START` by ~0.15–0.3s across a row; shrink `OPACITY_AMP` / `SCALE_AMP` per the `/√N` rule below.
- **Diagonal raked sweep** — angle `{sweepGradient}` (~105°) across a wordmark: the classic one-pass logo sheen. Narrower `SWEEP_WIDTH`, higher `SWEEP_PEAK_OPACITY`.

### Shimmer sweep (text-clipped status-phrase working-state)

The sweep re-aimed **inside type**: a soft highlight gradient clipped into a status phrase ("Thinking…", "Analyzing dataset…") via `background-clip: text` travels left→right through the letterforms — the grey-on-grey shimmer that says _still working_. Unlike every other form here it legitimately **repeats while the status is live**: the repetition is diegetic working-state, not idle wobble (same defense as a blinking caret — the motion performs status). Two things keep it honest: it is **bounded** (one finite tween whose pass count is computed from the status window, never `repeat: -1`), and it is **killed at resolve** — the moment the status completes, the shimmer stops dead; a shimmer surviving into the answer beat turns a working indicator into decoration.

```js
// Status shimmer — N passes as ONE bounded tween. Killed at resolve.
const status = document.getElementById("status-phrase");
// CSS on #status-phrase: background: {shimmerGradient}; background-size: 300% 100%;
// -webkit-background-clip: text; background-clip: text; color: transparent;
const shimmer = { p: 0 };
const PASSES = Math.round(STATUS_DUR / PASS_PERIOD); // whole passes, computed up front
tl.to(
  shimmer,
  {
    p: PASSES,
    duration: STATUS_DUR,
    ease: "none",
    onUpdate: () => {
      const t = shimmer.p % 1; // 0→1 within each pass; percent axis inverted → left→right travel
      status.style.backgroundPosition = `${(1 - t) * 100}% 50%`;
    },
  },
  STATUS_START,
);
tl.set(status, { backgroundPosition: "100% 50%" }, STATUS_START + STATUS_DUR); // resolve: dead.
```

Keep it a whisper: `{shimmerGradient}` is the status text's own grey with one slightly-lighter band (highlight stop a step above the base, nothing near white); `background-size` ~300% keeps the band narrow in the glyphs; `PASS_PERIOD` 1.2–1.8s — slower reads as a sheen accent, faster as a spinner. Whole-number `PASSES` lands the band at its start position exactly at the kill frame, so the `tl.set` is visually a no-op. This is the working-state cousin of `gradient-text-sweep`: reach **here** when the sweep _means_ "in progress," **there** when the gradient is the typographic treatment itself.

## Values

| token                   | range / default                                        | notes                                                                      |
| ----------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| GLOW_PEAK_OPACITY       | 0.15 (subtle) → 0.30 (default) → **0.45 hard ceiling** | higher washes the frame; a glow you consciously notice is too strong       |
| GLOW_INSET              | −200 to −450px (1920×1080)                             | negative so the halo extends past the hero; too small reads as a tight rim |
| GLOW_START_SCALE        | 0.80–1.0                                               | ≤1.0 — grow into place, never shrink                                       |
| BLOOM_DUR / BLOOM_START | 0.6–1.4s                                               | `BLOOM_START + BLOOM_DUR` ≈ the hero's settle frame                        |
| OPACITY_AMP / SCALE_AMP | 0.02–0.05 / 0.01–0.03 default                          | `PEAK + OPACITY_AMP ≤ 0.45`; push only when the glow is the sole motion    |
| BREATHE_CYCLES          | period 2.5–4s per breath                               | glow breathes slower than element breathing                                |
| SWEEP_WIDTH             | 15–35% of surface (grid) / 8–15% (wordmark)            |                                                                            |
| SWEEP_DUR               | 0.8–1.6s                                               | one deliberate pass — slow enough to read as light                         |
| SWEEP_PEAK_OPACITY      | 0.10 → 0.25 (default) → 0.40                           | same ≤ ~0.45 wash limit; tight sweeps tolerate the high end                |
| SWEEP_START_X / END_X   | fully off-surface both ends                            | no visible spawn/despawn mid-surface; fade reaches 0 as the band clears    |
| PASS_PERIOD (shimmer)   | 1.2–1.8s                                               | with whole-number PASSES                                                   |

## Critical Constraints

- **Glow peak opacity ≤ 0.45** — including breathe amplitude; default to the LOW end (0.15–0.30).
- **Glow behind, hero in front**; glow color darker + more saturated than the hero surface.
- **Land glow and hero as one beat** — before or after reads as two separate events.
- **Breathe is bounded, sweep is one pass** — the only sanctioned repetition is the shimmer sweep, bounded and killed at resolve.
- **Concurrent halos compound** — per-glow amps ≤ default `/√N`, stagger breathe periods (2.6s / 2.9s / 3.3s) so they don't pulse in lockstep.
- **Don't combine a `boxShadow` glow on the hero with this halo layer** — they compete and read muddy; the glow lives on the dedicated layer.

## See also

`sine-wave-loop` (hero breathes on scale/y while the glow breathes on opacity, out of phase) · `press-release-spring` (the click-triggered sibling — never both behind one element) · `counting-dynamic-scale` / `stat-bars-and-fills` (bloom behind a landing stat) · `center-outward-expansion` (sweep across the assembled grid) · `gradient-text-sweep` (the design-beat gradient counterpart).

## Selected motion rule: spring-pop-entrance

---
name: spring-pop-entrance
description: The canonical entrance pop — an element (or staggered group) arrives by scaling 0 → 1 on a smooth long-tail settle (power3 default); bouncy overshoot is a rare, explicitly-playful exception. fromTo so it's correct at t=0 under seek.
metadata:
  tags: spring, entrance, pop, scale, power3, settle, stagger, reveal, arrival
---

# Spring-Pop Entrance

> **Smooth beats bouncy.** This entrance defaults to a smooth long-tail settle — `power3.out` (or `expo.out` for a faster front) — that decelerates cleanly into the resting size with **no overshoot**. Bouncy `back.out` is the **#1 instant turn-off** in agent-made videos and is almost never executed well; it is a rare, explicitly-playful exception (consumer / fun brand), never the default. When unsure, settle smoothly.

THE entrance primitive: an element (or staggered group) arrives by springing from nothing — `scale: 0 → 1`, optional small `y` rise — and settles without bouncing. This is **arrival**, not reaction: distinct from [press-release-spring.md](press-release-spring.md) (a click/press → release feedback chain on an element that already rests on screen). Many blueprints used to borrow that rule to fake an entrance; reach for this instead.

## How It Works

One `fromTo` carries the whole arrival: from `{ scale: 0, opacity: 0 }` (explicit, so t=0 is correct under seek) to `{ scale: 1, opacity: 1, ease: "power3.out" }`. For a **group**, the same `fromTo` runs per element at `i * STAGGER`, capped so the group reads as one arriving beat. The `scale` grow is load-bearing; the `y` rise is garnish — drop everything else and it must still read as a clean entrance. Let the ease produce the settle: never hand-key a `scale: 1.1` mid-state (it double-bounces against the curve).

## Recipe

```html
<!-- inside a standard scene clip (hyperframes-core) -->
<div class="pop-hero" id="hero">{heroLabel}</div>

<div class="pop-grid">
  <div class="pop-item">{itemA}</div>
  <div class="pop-item">{itemB}</div>
  <div class="pop-item">{itemC}</div>
</div>
```

```css
.pop-hero,
.pop-item {
  transform-origin: 50% 50%; /* in-place pop; move to the source point for the anchored variation */
  will-change: transform;
}
.pop-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: GRID_GAP;
  place-items: center;
}
```

```js
// Single hero pop — smooth long-tail settle, no overshoot.
tl.fromTo(
  "#hero",
  { scale: 0, opacity: 0 },
  { scale: 1, opacity: 1, duration: POP_DUR, ease: "power3.out" },
  ENTRY_AT,
);

// Staggered group pop — one arriving beat.
gsap.utils.toArray(".pop-item").forEach((el, i) => {
  tl.fromTo(
    el,
    { scale: 0, opacity: 0, y: Y_RISE },
    { scale: 1, opacity: 1, y: 0, duration: POP_DUR, ease: "power3.out" },
    GROUP_ENTRY_AT + i * STAGGER,
  );
});
```

## Variations

- **Calm settle** (premium / enterprise): `power3.out`, no rotation, `Y_RISE` 0–12px — a weighted, confident landing for a hero wordmark or product shot.
- **Firm settle** (everyday default): `power3.out` or `expo.out` for a punchier front, `Y_RISE` ~24px — cards, icons, callouts.
- **Exact-physics settle**: when the settle IS the shot, swap the ease for `springEase({ response: 0.4 })` (critically damped) from `../adapters/gsap-easing-and-stagger.md` → Spring Eases; take `duration` from the helper.
- **Origin-anchored pop**: a callout growing out of a specific point (marker, pointer tip) sets `transform-origin` to that point (e.g. `0% 100%`) so `scale: 0 → 1` reads as "emerging from the source", not "inflating in place".
- **Pop into a held slot**: land the pop and hold still — no idle loop baked into the entrance. If the held frame genuinely needs life, hand off to [sine-wave-loop.md](sine-wave-loop.md) for subtle jitter on a separate later tween; prefer revealing the next element on its VO cue.
- **Bouncy pop (RARE — explicitly-playful only)**: swap the ease for `back.out(OVERSHOOT)` and optionally settle a small `rotation: ROT_FROM → 0` so elements look hand-placed. Only for a deliberately playful register — never product / enterprise / serious tone:

```js
tl.fromTo(
  el,
  { scale: 0, opacity: 0, rotation: ROT_FROM },
  { scale: 1, opacity: 1, rotation: 0, duration: POP_DUR, ease: `back.out(${OVERSHOOT})` },
  GROUP_ENTRY_AT + i * STAGGER,
);
```

Even here keep `OVERSHOOT ≤ ~2` — past that it reads as cartoon wobble. Better still: the baked spring at `dampingFraction: 0.6–0.7` (same adapters doc) gives ~5–10% overshoot that reads physical where `back.out` reads cartoon.

## Values

| token      | range                                     | notes                                                            |
| ---------- | ----------------------------------------- | ---------------------------------------------------------------- |
| EASE       | `power3.out` default; `expo.out` punchier | `back.out(OVERSHOOT)` only in the playful variant                |
| POP_DUR    | 0.4–0.7s                                  | shorter = tight snap; hero must be visible by **t ≤ 0.5s**       |
| STAGGER    | 0.04–0.08s                                | `min(0.06, 0.5 / ITEM_COUNT)` — self-caps the window             |
| ITEM_COUNT | 3–9                                       | >9 makes the stagger vanish — switch to a wipe/sweep reveal      |
| Y_RISE     | 0–32px                                    | small; never large enough to read as a slide-up                  |
| ROT_FROM   | −10°–+10°                                 | playful variant only; alternate sign by index (`i % 2 ? 6 : -6`) |
| ENTRY_AT   | 0–0.4s                                    | a beat of quiet, but keep the subject landing by t ≤ 0.5s        |

## Critical Constraints

- Default ease `power3.out` (no overshoot); `back.out` only in the explicitly-playful variant, and there `OVERSHOOT ≤ ~2`.
- `ITEM_COUNT × STAGGER ≤ ~0.5s` — the group must land inside one beat.
- Entrances state the collapsed from-state in `fromTo` — never rely on a CSS-hidden start (it renders visible before the tween claims it under seek).
- `transform-origin: 50% 50%` for an in-place pop; the source point only for the anchored variation.
- This is a finite arrival — idle motion on a held element is a separate, later `sine-wave-loop` tween.

## See also

`center-outward-expansion` (pop while radiating to slots) · `press-release-spring` (the click-feedback counterpart) · `sine-wave-loop` (post-arrival jitter, sparingly).
