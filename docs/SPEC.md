# Sloth & Llama — Crossword Name Art Generator
## Project Requirements, Technical Specification & Development Plan

**Status:** Planning specification — V1  
**Project directory:** `~/projects/codemavens/crossword-generator`  
**Product:** Sloth & Llama personalized laser-cut family name art  
**Application:** Local web-based designer  
**Primary technologies:** React, TypeScript, Vite, Node.js, SQLite  
**Document version:** 1.1 (amended 2026-11-13 under CHG-0003; amendments are marked in place, and `original-spec.md` holds version 1.0 unchanged)

---

# 1. Project Overview

Develop a local web application that generates personalized Scrabble-style crossword name artwork suitable for laser cutting and engraving.

The user provides:

- A family name, such as "The Sanders"
- An optional year, such as "2026"
- A list of individual names
- Desired overall product dimensions
- Tile dimensions and engraving options
- Optional decorative artwork

The application automatically arranges the names into an interconnected crossword, generates a circular frame incorporating the family name, and produces laser-ready vector artwork for three separate wooden pieces.

The product will be manufactured by Sloth & Llama using a laser cutter.

The application is primarily an internal production tool, not initially a public-facing customer customizer.

## 1.1 Primary goals

1. Generate attractive, interconnected Scrabble-style arrangements from a list of names.
2. Maximize natural letter intersections while minimizing decorative connector tiles.
3. Permit individual decorative tiles containing hearts, spades, animals, custom SVG artwork, or nothing.
4. Generate accurate cutting, scoring, and engraving geometry.
5. Create three separate wooden pieces designed to be glued together.
6. Provide a fast, configurable local web interface.
7. Export SVG files compatible with LightBurn.
8. Save, search, reopen, and duplicate customer projects.
9. Minimize third-party dependencies, using only explicitly approved libraries.
10. Make the underlying engines reusable independently of the interface.

## 1.2 Scope and typical usage

The application should handle arrangements involving approximately 2–10 names.

Ten names is considered a relatively large and uncommon order. Twenty-name optimization is not required for V1.

Names must contain at least two characters.

The application should prioritize visual quality and useful alternatives rather than simply returning the first mathematically valid arrangement.

---

# 2. Physical Product Design

**Critical requirement: The product consists of THREE separately laser-cut pieces.**

These pieces are aligned and glued together.

They must not be mistakenly generated as one combined cutout.

## 2.1 Piece 1 — Interconnected crossword

This piece contains all individual names arranged as Scrabble-style letter tiles.

### Construction

- All names and decorative connector tiles form one continuous piece of wood.
- Every tile is square.
- Every tile has exactly the same dimensions.
- Matching characters at intersections share a single physical tile.
- Lettering is engraved.
- Optional Scrabble point values are engraved.
- Tile division lines are scored.
- Only the outside perimeter of the combined tile arrangement is cut.

### Outer cut geometry

The outer perimeter is created by taking the **geometric union of all occupied square tiles**.

An occupied tile can contain:

- A letter
- An apostrophe
- A hyphen
- A decorative SVG image
- Nothing (a blank decorative tile)

All occupied tiles participate equally in the union.

The result must be one physical piece.

Internal shared edges are not cut.

> **Amendment (2026-11-13, CHG-0003):** When names form a closed loop around empty squares, those enclosed squares are cut out as holes, so the backer shows through. The statement that only the outside perimeter is cut therefore means: the outer perimeter and the perimeter of any enclosed hole are cut, and nothing else. Hole cuts are ordered before the outer perimeter in the export so the piece does not shift before its holes are cut.

### Tile scoring

Internal tile boundaries are represented by a separate scoring operation.

Each shared boundary between occupied tiles should be scored once, not twice.

The resulting piece should visually resemble individual Scrabble tiles even though the complete arrangement is cut from one piece of wood.

### Letter engravings

Each occupied letter tile contains one character.

Optional small Scrabble point values may appear in the lower-right corner.

Point values are configurable globally.

Apostrophes and hyphens have no point values.

Decorative tiles also have no point values.

**Do not add structural reinforcement logic for narrow connections or single-letter attachment points.** The selected wood is expected to be sufficiently strong.

---

# 3. Piece 2 — Circular Frame With Welded Family Name

## 3.1 Critical visual requirement

This is one of the most important and previously misunderstood features.

The reference design shows a circular frame where the **family-name region is physically welded into the frame itself**.

It is NOT:

- A separate rectangular plaque.
- A floating nameplate.
- An oval or rectangular label attached to a ring.
- A family name engraved onto a generic circular frame with no contour changes.
- A series of letter-shaped holes cut through the wood.
- A separate piece that must be glued to the ring.

Instead, the circular frame and the material supporting the family-name engraving form **one continuous laser-cut piece**.

The family name and year are engraved onto that material.

## 3.2 Outer frame geometry

The exterior cutting perimeter must always remain a perfect circle.

The user controls the outer diameter.

The frame has a configurable ring width.

The inner opening is generally circular except where the family name and optional year modify its shape.

## 3.3 The rubber-band / shrink-wrap effect

**This behavior must be implemented as described below.**

> **Amendment (2026-11-13, CHG-0003):** The reference image is now in the repository at [`reference/frame-reference.png`](reference/frame-reference.png). Where it and the text of this section disagree, the image governs. The agreed V1 shape is:

> - The frame is one of three separate wooden layers. This section describes only the outline of the frame layer.
> - The inner cut is the inner circle, closed off at the bottom by a straight horizontal line at a configurable height. The line meets the ring at a corner. A curved bottom edge is preferred and is listed as a later improvement (§22); the straight line is accepted for V1. Build the bottom edge as a replaceable step so the curve can be added without redesign.
> - The family name sits on that line. An outline around the lettering, offset by the buffer setting, rises above the line and is merged into the solid area below it.
> - The outline is close to the lettering, following the tops of the letters as in the image. Gaps between letters are bridged so the cut never dips down between them. The smoothness setting runs from close (the default, matching the image) to a looser band.
> - The year sits in the solid area below the line.
> - The frame layer must come out as one outer circle and exactly one inner opening.
>
> Requirement 7 below ("smoothly merge ... on both sides") and the phrase "transitions smoothly into the circular opening" are relaxed to the corner described above for V1.

Imagine the family name engraved near the bottom of a circular frame.

Now imagine stretching a rubber band around the lettering, leaving a small, configurable amount of wood around it.

The rubber band follows the overall silhouette of the text, not the individual interior holes of letters.

This creates a smooth, organic contour that roughly follows the text without wrapping tightly around every small character detail.

The contour joins the inner edge of the circular ring at both sides.

In the reference image, the inner cut follows the **upper silhouette of the family-name lettering**, then transitions smoothly into the circular opening.

The bottom of the lettering and optional year remain supported by the solid wood extending toward the frame's outer circular edge.

The result is a circular frame whose lower inner edge rises around the family name.

### Required behavior

1. Position the family name near the lower section of the circle.
2. Position the optional year below the family name.
3. Determine the visible geometric bounds of the engraved lettering.
4. Generate a smooth enclosing envelope around the text.
5. Apply a configurable material buffer.
6. Use the envelope to modify the lower interior cut boundary of the circular frame.
7. Smoothly merge the resulting boundary into the normal inner circle on both sides.
8. Preserve the perfectly circular exterior edge.
9. Ensure that the resulting wood region is one connected physical piece.
10. Engrave the family name and year; do not cut them out.

### Important distinction

This is **NOT** simply an outline or offset of every glyph.

We do not want the inner cutting edge following every tiny indentation between letters.

We want the appearance of a stretched rubber band settling around the overall upper shape of the text.

The contour should look intentional and smooth.

### Suggested geometry algorithm

The implementation may use opentype.js, Paper.js, and Clipper2.

A suitable approach:

1. Convert the family-name text to vector glyph outlines.
2. Position the glyphs at their final physical size.
3. Create an enclosing shape around the combined visible text geometry.
4. Apply a configurable offset to provide the desired material margin.
5. Smooth or simplify the resulting upper envelope.
6. Combine that shape with the solid circular ring using a geometric union.
7. Clip the result to the outer circle to preserve the exact outer diameter.
8. Generate the final closed inner cutting boundary.
9. Check that the output contains the intended connected frame and no unintended islands or extra cutouts.

A concave hull, morphological closing, or similar contour construction technique may be useful, but the resulting visual shape matters more than the particular mathematical method.

**The actual cut geometry must be the union of the frame ring and the buffered family-name region, not merely the family-name text itself.**

The final shape should visually resemble the close-up reference supplied during planning: the name area emerges organically from the lower interior edge of the circular ring.

## 3.4 Configurable frame parameters

The interface should support:

- Outer frame diameter
- Ring width
- Family-name font
- Family-name font size
- Family-name position
- Optional year
- Year font and size
- Text-to-cut buffer distance
- Contour smoothness or tightness
- Frame/name spacing

> **Amendment (2026-11-13, CHG-0003):** Also configurable: the height of the straight bottom line, and the minimum gap between the crossword and the frame's inner edge (default 5 mm, see §9).

Defaults should be provided, but the user should be able to change these parameters.

## 3.5 Engraving operations

The family name and year are engraved.

They must be separated from the cutting paths so the laser software can apply different operations.

The family-name text itself must never accidentally become the inner cutting perimeter.

---

# 4. Piece 3 — Solid Circular Backer

The third piece is the backing layer.

### Requirements

- One solid circular disk.
- Same outside diameter and exterior silhouette as Piece 2.
- No internal cutouts.
- No holes for the crossword tiles.
- No engraving required by default.

The crossword piece and circular frame are glued onto this backer.

Because the frame's outside edge remains a perfect circle, the backer is simply a matching disk.

All three pieces must share a consistent coordinate system for correct sizing and alignment.

---

# 5. Tile System

## 5.1 Uniform square tiles

**Every tile is always square, and all tiles must have identical dimensions.**

This applies to:

- Standard letter tiles
- Apostrophe tiles
- Hyphen tiles
- Decorative tiles
- Blank connector tiles
- Blank tiles placed for decoration

A global tile-size property controls the dimensions of all tiles.

Changing tile size must resize every tile uniformly.

### Suggested initial default

12.7 mm (0.5 inches).

This is a suggested default, not a fixed manufacturing requirement. It should be evaluated during physical testing.

Tile dimensions should be stored internally in millimeters.

The UI may display inches or millimeters.

## 5.2 Standard letter tiles

Contain a single engraved letter.

Optional Scrabble score values may be included.

Shared intersection tiles are engraved only once.

## 5.3 Punctuation tiles

Apostrophes and hyphens are treated exactly like name characters.

Examples:

`O'BRIEN`

`ANNE-MARIE`

Each punctuation character occupies a full square tile.

The punctuation character is engraved.

It is not a decorative placeholder.

### Intersection rules

Matching punctuation characters may intersect naturally.

Allowed examples:

- `A` intersects `A`.
- `'` intersects `'`.
- `-` intersects `-`.

Disallowed examples:

- `'` intersects `-`.
- `A` intersects `'`.
- `B` intersects `C`.

For comparison, curly apostrophes may be normalized to a canonical apostrophe.

The original display formatting should be preserved when feasible.

> **Amendment (2026-11-13, CHG-0003):** Supported name characters are A–Z, the apostrophe, the hyphen and accented Latin letters.

> - Text is Unicode-normalised (NFC) and letters are always engraved uppercase.
> - Each accented letter is one tile and intersects only an identical letter: É does not intersect E.
> - A letter whose uppercase form is more than one character (for example ß) is rejected.
> - An accented letter shows the point value of its base letter.
> - A space inside a name is rejected with a message suggesting the joined or hyphenated form (MARYANN or MARY-ANN).
> - A character the chosen font cannot draw is a validation error.

Punctuation tiles do not have Scrabble scores.

## 5.4 Decorative tiles

Every decorative tile has a unique identity and individually configurable artwork.

Examples include:

- Heart
- Spade
- Paw print
- Cat face
- Cow
- Star
- Any user-supplied compatible SVG
- Blank tile with no artwork

Each tile is independently configurable.

One connector might contain a heart, another a spade, and another a cow.

Changing one tile's artwork must not change another tile's artwork.

All artwork is engraved into the tile rather than cut through it.

Imported SVGs should maintain their aspect ratio and fit inside an engraving-safe margin.

## 5.5 Blank tiles

A blank tile is a normal occupied square without engraving.

It is still included in the crossword's outer union geometry.

A blank tile can serve as a connector or purely decorative end tile.

---

# 6. Crossword Solver Rules

The solver is a standalone TypeScript module that has no dependency on React, SQLite, or SVG rendering.

It receives names and settings and returns one or more valid arrangements.

## 6.1 General rules

1. Every input name must appear completely.
2. Every input name must contain at least two characters.
3. Names are horizontal or vertical.
4. Horizontal names read left to right.
5. Vertical names read top to bottom.
6. Names intersect only perpendicularly.
7. A natural intersection requires identical characters.
8. Matching apostrophes and matching hyphens are valid intersection characters.
9. Shared characters occupy one physical tile.
10. Parallel names may not be placed immediately alongside each other.
11. Unintended letter adjacency must not create apparent additional names.
12. All occupied tiles must ultimately form one connected physical piece.
13. Each name must have its own distinct logical placement.
14. Full-name containment or coincident parallel placement is not allowed.
15. Decorative connectors must preserve every character of the original names.

> **Amendment (2026-11-13, CHG-0003):** Rules 10–12 are made precise as follows.

> - Two squares that share an edge are legal only if both belong to the same name, or one is a decorative tile attached to the other's name (through its anchor or its join, see §15).
> - The square before a name's first character and the square after its last must be empty or hold a decorative tile attached to that name: one anchored to that end, or a connector that joins that name (the L-corner in §6.4).
> - Squares that touch only at a corner are allowed.
> - Connectivity is counted only through intersections and connectors, never through contact alone.

## 6.2 Connection requirements

**A natural intersection or explicit decorative connector is required for a logical connection between names.**

Physical adjacency alone does not count as a valid connection.

This is important.

The solver must not exploit accidental contact between unrelated name tiles to satisfy connectivity.

Examples of valid connections:

- Two perpendicular names intersect at a matching letter.
- Two perpendicular names intersect at matching punctuation.
- Two perpendicular names connect through one explicitly placed decorative tile.

Examples of invalid connections:

- Parallel names touching along their sides.
- Two names touching accidentally without a defined intersection or connector.
- Names overlapping at nonmatching characters.
- Two or more decorative connector tiles chained between a pair of names.

## 6.3 Perpendicular-only rule

Names connected together must be perpendicular at that connection.

Two parallel names must not be joined by a decorative connector.

Names may share the same orientation elsewhere in the layout, but their connecting relationships must follow the perpendicular rule.

## 6.4 Automatic decorative connectors

Automatic connectors are used when natural intersections cannot adequately connect all the names.

The solver should prefer natural intersections.

### Critical connector rule

**There may never be more than ONE decorative tile used between two names.**

No chains of two or more heart tiles.

No sequence of multiple blank tiles bridging two words.

A single decorative tile can connect the boundary of one name to the boundary of a perpendicular name.

> **Amendment (2026-11-13, CHG-0003):** Two connector shapes are allowed. In both, the tile sits just past the end of one name (its anchor). A connector joins exactly two names.

> ```text
> L-corner              T-shape
>
> M I K E [*]           M I K E [*] J
>         [B]                       O
>         [O]                       H
>         [B]                       N
> ```
>
> - **L-corner:** the other, perpendicular name starts or ends next to the tile.
> - **T-shape:** the other, perpendicular name runs past the tile side-on, touching it with one of its squares.

The connector does not replace any character.

The complete spellings of both names remain intact.

Connector placements must be validated against name-boundary and orientation rules.

Where a valid connection cannot be achieved with one connector tile, the solver must search for another arrangement.

## 6.5 Manually added decorative tiles

V1 supports adding a blank or decorative tile at the beginning or end boundary of an existing name.

This may be done even when the tile is not needed for connectivity.

For example, a user may place a heart at the end of a name simply for visual appearance.

### Placement restrictions

- Manual additions are permitted only at name boundaries.
- No inserting decorative tiles in the middle of a name.
- No replacing letters with decorations.
- No overwriting occupied cells.
- The tile must retain the same dimensions as all other tiles.
- The placement must not introduce an invalid name overlap or adjacency.
- Existing layout validity must be preserved.

> **Amendment (2026-11-13, CHG-0003):** A manually added decorative tile may touch only the end square of the name it is anchored to.

The tile editor should allow:

- Adding a tile at an eligible boundary position
- Choosing built-in SVG artwork
- Uploading compatible SVG artwork
- Switching to a different image
- Clearing the image while retaining a blank tile
- Removing the decorative tile

Adding or editing artwork does not regenerate the crossword.

A manual decorative tile may be purely ornamental.

### Regeneration behavior

If the user deliberately clicks **Regenerate**, manually added decorations do not need to be preserved.

The user can add them again to the newly generated arrangement.

No locking mechanism is required for V1.

---

# 7. Crossword Layout Generation

## 7.1 General approach

Use a custom algorithm written in TypeScript.

The recommended approach is a multi-start, bounded beam-search or similar heuristic search.

Do not rely on a third-party crossword-generation library.

The algorithm should produce attractive layouts, not simply the first valid result.

## 7.2 Search sequence

### Step 1 — Normalize input

- Trim whitespace.
- Normalize relevant punctuation for matching.
- Convert characters to a canonical comparison representation.
- Preserve original display values.
- Reject names shorter than two characters.
- Validate supported characters.

Names with identical text may appear as separate entries if they represent different people.

### Step 2 — Analyze potential intersections

Create an index of matching-character opportunities between names.

Include:

- Matching alphabetic characters
- Matching apostrophes
- Matching hyphens

Record positions at which two names could intersect.

### Step 3 — Select initial placement

Choose a starting name and orientation.

Use multiple starting names and orientations across search attempts.

This reduces the chance of producing a poor layout because of an arbitrary starting choice.

### Step 4 — Generate candidate placements

For each unplaced name:

1. Find matching characters in already placed perpendicular names.
2. Calculate possible grid coordinates.
3. Validate each proposed placement.
4. Reject conflicting or invalid arrangements.
5. Score promising partial arrangements.
6. Retain multiple candidates for further exploration.

### Step 5 — Prefer natural intersections

Continue expanding layouts with genuine intersections whenever useful.

Do not prematurely introduce decorations when reasonable natural arrangements remain available.

### Step 6 — Add single-tile connectors

When natural intersections cannot place remaining names, search for single-tile connector opportunities.

Validate:

- One connector tile only
- Perpendicular relationship
- Placement at name boundaries
- No replacement of letters
- No conflicts with existing occupied cells
- No unintended adjacency

Newly connected names may create additional natural intersection opportunities for subsequent names.

The algorithm should therefore be able to alternate between natural placement and connector placement.

### Step 7 — Generate multiple complete candidates

Return several distinct valid arrangements.

Avoid presenting solutions that are merely translated or rotated copies of one another.

### Step 8 — Rank candidates

Apply the configurable scoring system described below.

### Step 9 — Return layouts and diagnostics

Results should include:

- Name placements
- Automatic connector positions
- Calculated layout bounds
- Intersection count
- Connector count
- Score breakdown
- Fit information
- Validation issues
- Random seed

## 7.3 Search effort

Support three modes:

- Quick
- Balanced
- Thorough

These control search budgets, beam widths, number of restarts, or similar search parameters.

They must not change the mandatory placement rules.

A deterministic random seed should permit reproducing a generated arrangement.

---

# 8. Configurable Layout Scoring

The user has approved the following default weights:

| Criterion | Default weight |
|---|---:|
| Circular fit | 25 |
| Compactness | 20 |
| Visual balance | 35 |
| Natural intersections | 40 |
| Few decorative connectors | 45 |
| **Total** | **165** |

**These weights must be configurable in the web interface.**

They are not constants permanently embedded in the solver.

## 8.1 Scoring formula

Each metric should produce a normalized score between 0 and 1.

Use a relative weighted average:

`score = sum(weight × normalizedMetric) / sum(weights)`

The weights do not need to total 100.

A zero weight disables that particular preference, not a mandatory validation rule.

If all weights are zero, use a documented deterministic fallback ranking.

## 8.2 Scoring categories

### Circular fit — 25

Measures how well the crossword occupies the usable portion of the circular frame.

Account for the frame's inner boundary and the family-name region, not just a simple bounding rectangle.

A layout extending outside the frame receives a lower score but can still be shown.

> **Amendment (2026-11-13, CHG-0003):** The solver stays free of fonts and drawing. It receives the usable opening as polygon data in tile units, together with the minimum gap. Until the frame geometry exists (Phase 5), the opening passed in is a plain circle.

### Compactness — 20

Prefer arrangements that avoid unnecessary width, height, or empty space.

Compactness should be evaluated independently from circular fit.

### Visual balance — 35

Favor visually balanced arrangements.

Relevant factors include:

- Distribution of occupied tiles
- Visual center
- Excessive extensions in one direction
- Unbalanced empty areas
- Relationship to the usable circle interior

### Natural intersections — 40

Reward valid shared-character intersections.

This includes matching letters and matching punctuation.

Prefer genuine crossword-style intersections over decorative joining.

### Few decorative connectors — 45

Strongly discourage unnecessary automatic connectors.

Layouts using fewer connectors should generally rank better, all else equal.

Decorative tiles manually added for appearance should not retroactively count as automatic connector penalties.

## 8.3 User interface

Provide a slider or numeric input for each weight.

Also provide:

- Current value
- Reset to Defaults
- Generate / Regenerate button
- Score breakdown for generated candidates

Changing the weights should update project settings but not silently change the existing arrangement.

The new weights take effect when the user explicitly regenerates or reranks the candidates.

Weights are stored per project in SQLite.

---

# 9. Frame Fit and Sizing Behavior

The user can configure:

- Circular frame diameter
- Square tile size

All tiles resize together.

> **Amendment (2026-11-13, CHG-0003):** Default position and the fit test are defined as follows.

> - The centre of the crossword's bounding rectangle is placed on the centroid (balance point) of the usable opening, which is the area inside the frame's inner cut, above the family-name region. The layout's `offset` is added on top.
> - A minimum-gap setting, `crosswordClearanceMm`, defaults to 5 mm.
> - The crossword fits when every tile lies inside the usable opening shrunk inward by that gap.

## 9.1 Overflow handling

**The solver must be permitted to return a valid arrangement that does not fit inside the selected circular frame.**

This is intentional.

If the user has selected a frame that is too small, the application should still display the arrangement.

The preview must make the overflow apparent.

A clear warning should indicate that the crossword exceeds the available cut area.

The user may then:

- Increase the frame diameter.
- Decrease the global tile size.
- Regenerate to search for a better-fitting arrangement.

Do not silently change manufacturing dimensions.

## 9.2 Validation categories

Separate structural validity from manufacturing fit.

A crossword may be:

- Structurally valid and within the frame.
- Structurally valid but extending beyond the frame.
- Structurally invalid.

Overflow is a warning, not automatically a solver failure.

However, final production export should clearly identify unresolved fit problems and should not silently generate a supposedly production-ready design with overlapping physical pieces.

---

# 10. Manual Editing Scope

## 10.1 V1 supported editing

V1 supports:

- Choosing a generated arrangement
- Configuring layout scoring
- Changing tile size
- Changing frame dimensions
- Adding decorative or blank tiles at word boundaries
- Selecting artwork for individual decorative tiles
- Removing manually added decorative tiles
- Changing engraving settings
- Regenerating the complete crossword

## 10.2 V1 exclusions

Do not implement the following initially:

- Dragging individual names
- Rotating individual names manually
- Locking individual names
- Preserving manually adjusted name positions through regeneration
- Complex manual crossword restructuring

## 10.3 Future entire-crossword dragging

The user wants the ability to move the **entire connected crossword as one object** within the circular frame.

It must not require moving individual names separately.

This feature may be implemented after V1.

To support it cleanly, the data model should contain a layout-level translation or offset that moves the entire group without changing the relative grid coordinates of individual names.

An implementation may support continuous physical positioning later, even though the solver uses integer grid coordinates.

---

# 11. Application Architecture

## 11.1 Approved technology

| Technology | Purpose |
|---|---|
| React | Web interface |
| TypeScript | Application logic and solver |
| Vite | Frontend development and build |
| Node.js | Local API/service |
| SQLite | Persistent local project datastore |
| SVG | Preview and laser production output |

## 11.2 Approved libraries

The user has explicitly approved:

### opentype.js

Repository: https://github.com/opentypejs/opentype.js

License: MIT

Purpose:

- Font loading
- Glyph outline generation
- Text-to-vector conversion
- Precise text geometry
- Exportable vector engraving paths

### clipper2-ts

Repository: https://github.com/countertype/clipper2-ts

License: Boost Software License 1.0

Purpose:

- Polygon unions
- Polygon differences
- Polygon offsetting
- Reliable physical cutting geometry

### Paper.js

Repository: https://github.com/paperjs/paper.js

License: MIT

Purpose:

- Vector path operations
- Bézier curve handling
- Contour construction
- Contour smoothing
- Possible future vector editing tools

All three are approved for use.

They should be used only where they provide a clear benefit.

**Avoid implementing the same final geometric operation independently in multiple libraries.** Assign clear responsibilities.

> **Amendment (2026-11-13, CHG-0003):** Responsibilities: `clipper2-ts` owns every union, difference and offset. `opentype.js` owns glyph outlines. Paper.js is not installed unless curve smoothing proves it is needed.

The crossword solver itself should be our own TypeScript implementation.

The approved library set is not permission to add arbitrary new dependencies. Any new library must be proposed with its purpose, license, and project URL for explicit approval before adoption.

## 11.3 Licensing safeguards

Because of concerns about open-source libraries later changing to paid or restricted licenses:

- Pin exact package versions.
- Commit the package lockfile.
- Document dependency versions and licenses.
- Retain license notices as required.
- Review dependency upgrades before applying them.
- Avoid unnecessary packages.
- Isolate third-party library usage behind application-owned interfaces where practical.
- Prefer permissive open-source licenses.
- Confirm font licensing separately from font-processing library licensing.

---

# 12. Locally Installed Applications

The development machine already has:

- Blender
- Inkscape
- LightBurn

## 12.1 Inkscape

Use as an optional vector-processing and verification tool.

Potential tasks:

- Inspect SVG output.
- Convert text to vector paths.
- Verify geometric operations.
- Inspect or repair complex SVG files.
- Assist in validating the family-name envelope.

Inkscape may also be invoked from the local Node service through its CLI if useful.

The application should ideally generate its own completed SVG files without requiring a manual Inkscape step for every customer order.

## 12.2 LightBurn

The primary laser-production environment.

Use to:

- Import generated SVG files.
- Verify dimensions.
- Assign or inspect cut, score, and engrave operations.
- Prepare machine settings.
- Execute laser jobs.

The exporter should maintain separate operation categories that LightBurn can distinguish.

## 12.3 Blender

Optional future use.

Potential capabilities:

- Three-dimensional preview of assembled layered wood.
- Product mockups.
- Material thickness visualization.
- Marketing images for Sloth & Llama.

Blender is not needed for the core solver or initial SVG output.

---

# 13. Application Modules

Recommended logical structure:

## 13.1 Project management

Create, save, load, duplicate, search, and delete projects.

Store customer/project metadata and design JSON in SQLite.

## 13.2 Solver engine

Pure TypeScript logic responsible for:

- Name normalization
- Intersection discovery
- Candidate placement
- Placement validation
- Connector placement
- Candidate generation
- Ranking

No rendering or database dependencies.

## 13.3 Layout model

Maintains:

- Name placements
- Decorative tile positions
- Connector relationships
- Selected layout
- Optional overall translation
- Solver seed and scoring

## 13.4 Geometry engine

Responsible for:

- Grid-to-physical coordinate conversion
- Square tile union outline
- Tile divider paths
- Circular frame geometry
- Family-name rubber-band contour
- Frame/name geometric union
- Backer geometry

## 13.5 Typography engine

Responsible for:

- Loading fonts
- Measuring text
- Calculating glyph positions
- Producing vector outlines
- Supporting engraved lettering and scores

## 13.6 Artwork engine

Responsible for:

- Built-in decorative SVG assets
- Custom SVG import
- Artwork scaling and placement
- Sanitizing imported SVG
- Engraving path generation

## 13.7 SVG exporter

Responsible for generating files for the three pieces with distinct laser operations.

## 13.8 Local API

Node.js-based local service for:

- SQLite project management
- Optional Inkscape CLI processing
- Project import/export
- Future local filesystem integration

---

# 14. SQLite Project Storage

**SQLite has been explicitly approved.**

MySQL is not required.

The application runs locally and does not need a separate database server.

## 14.1 Database approach

Use SQLite as the persistent datastore.

Store:

- Project IDs
- Project titles
- Optional customer names
- Creation and modification timestamps
- Schema versions
- Complete JSON project documents

The current preference is Node.js built-in SQLite support to avoid another third-party dependency.

The database access implementation should be wrapped behind our own repository interface so the SQLite driver can be changed later if necessary.

## 14.2 Suggested schema

```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    customer_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    design_json TEXT NOT NULL
);

CREATE INDEX idx_projects_name
ON projects(project_name);

CREATE INDEX idx_projects_customer
ON projects(customer_name);

CREATE INDEX idx_projects_updated
ON projects(updated_at);
```

## 14.3 Persistence model

The JSON design document contains:

- Family name
- Optional year
- Names
- Selected crossword layout
- Decorative tiles
- Custom artwork references or contents
- Fonts and engraving settings
- Frame and tile dimensions
- Solver preferences
- Current scoring weights

Cutting geometry does not need to be stored.

Regenerate cutting paths from the project data whenever needed.

This prevents outdated SVG geometry from disagreeing with the saved design.

## 14.4 Project features

Initial support should include:

- New project
- Save
- Save As / Duplicate
- Open
- Search
- Delete with confirmation
- Import JSON
- Export JSON

Autosaving may be added, with care not to overwrite intentional alternate versions.

---

# 15. Suggested TypeScript Data Model

This is the conceptual model for V1. It may be refined during implementation without changing the agreed behavior.

```typescript
type Direction = "horizontal" | "vertical";

interface GridPosition {
  x: number;
  y: number;
}

interface NameEntry {
  id: string;
  text: string;
}

interface NamePlacement {
  nameId: string;
  start: GridPosition;
  direction: Direction;
}

// Amended 2026-11-13 (CHG-0003): anchor and joinsNameId added.
interface DecorativeTile {
  id: string;
  position: GridPosition;
  artworkId: string | null;
  source: "automatic" | "manual";
  purpose: "connector" | "decoration";

  // The name end this tile extends.
  anchor: { nameId: string; end: "start" | "end" };

  // Connectors only: the one other name this tile joins.
  joinsNameId?: string;
}

interface ArtworkAsset {
  id: string;
  name: string;
  source: "builtin" | "custom";
  svg?: string;
}

interface SolverWeights {
  circularFit: number;
  compactness: number;
  visualBalance: number;
  naturalIntersections: number;
  fewConnectors: number;
}

interface SolverSettings {
  seed: number;
  searchMode: "quick" | "balanced" | "thorough";
  weights: SolverWeights;
}

interface CrosswordLayout {
  id: string;
  seed: number;
  placements: NamePlacement[];

  // Amended 2026-11-13 (CHG-0003): renamed from `connectors`;
  // holds automatic connectors and manual decorations.
  decorativeTiles: DecorativeTile[];

  // Reserved for translating the completed
  // crossword as one physical group.
  offset: {
    xMm: number;
    yMm: number;
  };
}

interface FrameSettings {
  outerDiameterMm: number;
  ringWidthMm: number;

  familyNameFontId: string;
  familyNameFontSizeMm: number;

  yearFontId?: string;
  yearFontSizeMm?: number;

  nameBufferMm: number;
  contourSmoothness: number;

  // Amended 2026-11-13 (CHG-0003).
  bottomLineHeightMm: number;
  crosswordClearanceMm: number; // default 5
}

interface LetteringSettings {
  tileFontId: string;
  showScores: boolean;
}

interface DesignSettings {
  tileSizeMm: number;
  frame: FrameSettings;
  lettering: LetteringSettings;
  solver: SolverSettings;
}

interface NameArtProject {
  id: string;
  schemaVersion: number;

  projectName: string;
  customerName?: string;

  familyName: string;
  year?: string;

  names: NameEntry[];
  artwork: ArtworkAsset[];

  settings: DesignSettings;

  selectedLayout?: CrosswordLayout;
}
```

### Default weights

```typescript
const DEFAULT_SOLVER_WEIGHTS: SolverWeights = {
  circularFit: 25,
  compactness: 20,
  visualBalance: 35,
  naturalIntersections: 40,
  fewConnectors: 45,
};
```

Do not introduce name locking in V1.

## 15.1 Source of truth

Persist the logical crossword arrangement.

Calculate the occupied grid from:

- Name entries
- Name placements
- Decorative tiles

Then calculate physical geometry from the occupied grid and design settings.

Do not separately store another independently editable copy of the tile grid.

This avoids mismatched positions and duplicated state.

## 15.2 Character handling

Names should be processed as normalized character sequences.

Apostrophes and hyphens are regular name characters in the logical grid.

The implementation should handle Unicode carefully and should not assume that every visually displayed character is always represented by one JavaScript UTF-16 code unit.

Support for accented names and additional Unicode alphabets can be expanded later if not included in the initial name-validation scope.

> **Amendment (2026-11-13, CHG-0003):** Accented Latin letters are in V1 scope; see §5.3. Other alphabets remain later work.

---

# 16. Derived Geometry and Values

The following should be generated rather than stored independently:

| Value | Derived from |
|---|---|
| Occupied tile grid | Name placements and decorations |
| Shared intersections | Overlapping perpendicular names |
| Layout dimensions | Occupied tile coordinates |
| Crossword silhouette | Union of occupied squares |
| Tile score lines | Internal shared edges |
| Engraving paths | Tile characters and artwork |
| Family-name text paths | Text and font settings |
| Rubber-band contour | Family-name geometry and buffer settings |
| Frame cutting geometry | Ring and buffered-name union |
| Backer geometry | Frame exterior |
| Circle fit status | Physical geometry and positioning |
| SVG output | Generated paths and operation settings |

All geometry calculations must use consistent physical units.

---

# 17. SVG Export Specification

## 17.1 Required files

At minimum, support:

- `crossword.svg`
- `frame.svg`
- `backer.svg`

Also support an optional:

- `combined.svg`

The combined file may arrange the three pieces on a cutting sheet with adequate spacing.

## 17.2 Laser operations

Use separate vector groups or layers for:

### Cut

- Crossword outer union silhouette
- Crossword enclosed holes, cut before the outer silhouette (amended 2026-11-13, CHG-0003)
- Circular frame outer perimeter
- Circular frame inner perimeter
- Backer outer perimeter

### Score

- Internal crossword tile boundaries

### Engrave

- Name characters
- Optional Scrabble scores
- Decorative images
- Family name
- Optional year

Use configurable operation colors compatible with the intended LightBurn workflow.

Avoid duplicate cutting paths and overlapping line segments that could cause repeated cutting.

## 17.3 Font conversion

For production exports, convert lettering into vector outlines.

Do not depend on the receiving laser computer having the same fonts installed.

Use the approved opentype.js library where appropriate.

The preview and export must use consistent font metrics and positioning.

## 17.4 Dimensional accuracy

All exports must preserve exact physical dimensions.

Use SVG `width`, `height`, and `viewBox` consistently.

Test round-trip imports in LightBurn and Inkscape.

## 17.5 SVG asset safety

Custom SVG artwork must be validated and sanitized.

Do not permit imported artwork to execute scripts or reference external network resources in the application.

Restrict supported artwork to appropriate vector graphics.

---

# 18. User Interface Requirements

## 18.1 General design

Use React, TypeScript, and Vite.

The app runs locally in a browser.

A local Node.js service handles persistence and optional external desktop-tool integration.

## 18.2 Main inputs

Provide:

- Project name
- Optional customer name
- Family name
- Optional year
- Names list
- Tile size
- Circle diameter
- Frame ring width
- Family-name buffer
- Fonts and text sizes
- Scrabble-score visibility
- Solver effort
- Configurable solver weights

## 18.3 Layout preview

The preview should display the completed assembly.

Include visibility toggles for:

- Crossword
- Frame
- Backer
- Cut lines
- Score lines
- Engraving

The preview should accurately display the welded family-name contour.

Do not use a generic ring or separate plaque as a substitute for the actual frame geometry.

## 18.4 Layout selection

The user should be able to:

- Generate candidate arrangements
- See several alternatives
- Select one
- Review its score breakdown
- Regenerate the complete design

## 18.5 Decorative tile editing

The user can click an eligible word-boundary location.

The app should offer an editor to:

- Add a tile
- Select built-in artwork
- Upload an SVG
- Leave the tile blank
- Replace existing artwork
- Remove the tile

The artwork is configured per tile, not globally.

## 18.6 Sizing and fit feedback

Display:

- Current tile dimensions
- Frame diameter
- Overall crossword dimensions
- Whether the design fits
- Overflow indications
- Suggestions to adjust tile size or circle diameter

The preview must still show an overflowing but otherwise valid arrangement.

## 18.7 Export controls

Support exporting each physical piece independently and optionally a combined cutting layout.

Clearly identify cut, score, and engrave operations.

---

# 19. Solver Validation

Build validation separately from candidate generation.

Use the same validator for generated layouts and user modifications.

## 19.1 Structural errors

Examples:

- Missing name
- Name shorter than two characters
- Conflicting intersection characters
- Parallel overlap
- Invalid side-by-side adjacency
- Accidental connection without matching character or explicit connector
- Connector linking parallel names
- More than one connector tile between names
- Connector placed inside a name
- Disconnected crossword
- Decorative tile overwriting a name
- Duplicate occupied geometry caused by invalid placements

## 19.2 Warnings

Examples:

- Crossword exceeds the available circle area
- Poor visual balance
- Very low circular fit score
- High connector count
- Potentially undesirable arrangement

The application should distinguish errors from warnings.

A valid arrangement may have warnings.

---

# 20. Testing Requirements

Optimize V1 around 2–10 names.

Ten names is sufficient as the main upper-end test case.

### Solver tests

- Two names sharing a character
- Two names with no shared characters
- Names sharing multiple possible characters
- Repeated letters
- Names with matching apostrophes
- Names with matching hyphens
- Invalid punctuation intersection
- Names with identical text
- Unintended parallel adjacency
- Accidental physical contact
- Valid single-tile connector
- Invalid two-tile connector chain
- Connector between parallel names
- Connector at an invalid interior position
- Manual decorative end tile
- All names included exactly once
- Entire crossword connected
- Deterministic generation with identical seed

### Geometry tests

- Every square has the configured tile size
- Changing tile size updates all squares
- Shared intersections do not duplicate tiles
- Crossword union contains no duplicate perimeter segments
- Internal tile lines are scored, not cut
- Frame exterior remains exactly circular
- Family-name region merges into frame
- Rubber-band contour encloses engraving with the specified margin
- Frame has one intended connected shape
- Backer matches the frame exterior
- No unintended internal cutouts

### Export tests

- Correct physical dimensions
- Correct cut and engrave separation
- Font conversion to paths
- Valid SVG output
- LightBurn import
- Inkscape verification

### Performance tests

Test typical 2–6 name designs frequently.

Include 10-name designs as upper-end V1 scenarios.

Larger cases may be used as occasional stress tests without making them an optimization target.

---

# 21. Development Phases

> **Amendment (2026-11-13, CHG-0003):** Two sequencing changes apply; phase numbers are kept for reference.

> - The welded-frame geometry (Phase 5) is prototyped directly after Phase 1, before the solver, because it is the highest-risk piece and does not depend on the solver.
> - A throwaway SVG is imported into LightBurn during Phase 4 to prove colour-to-operation mapping and millimetre scaling early, instead of waiting for Phase 7.

## Phase 1 — Repository and Application Foundation

Set up:

- Local project directory
- Git repository
- React
- TypeScript
- Vite
- Node.js local service
- SQLite
- Approved dependencies
- Shared TypeScript models

Create the basic interface for entering a family name and list of names.

Render a simple manually constructed crossword preview.

**Deliverable:** Running local application with project persistence and basic SVG grid rendering.

## Phase 2 — Crossword Solver

Implement:

- Name normalization
- Punctuation handling
- Intersection indexing
- Placement validation
- Multi-start search
- Candidate generation
- Beam-search or equivalent bounded exploration
- Configurable scoring weights
- Candidate ranking
- Deterministic generation

Do not add connector logic until basic natural intersections are reliable.

**Deliverable:** Multiple valid crossword arrangements with natural intersections.

## Phase 3 — Connectors and Decorative Tiles

Implement:

- Automatic single-tile connectors
- Perpendicular-only connector validation
- Word-boundary detection
- Manual end-tile additions
- Individual artwork selection
- Built-in vector artwork
- Custom SVG imports
- Blank tiles

**Deliverable:** Disconnected name groups can be joined using valid single-tile connectors, and decorations can be edited independently.

## Phase 4 — Crossword Physical Geometry

Implement:

- Occupied grid derivation
- Tile union perimeter
- Tile scoring lines
- Engraved characters
- Optional point values
- Decorative engraving
- Uniform tile-size scaling

**Deliverable:** Complete SVG geometry for Piece 1.

## Phase 5 — Welded Circular Frame and Backer

**This phase requires special attention to the reference image and rubber-band geometry.**

Implement:

1. Circular ring.
2. Font vector outline generation.
3. Family-name placement.
4. Optional year placement.
5. Smooth upper text envelope.
6. Configurable material buffer.
7. Rubber-band contour construction.
8. Union with circular ring.
9. Smooth transitions to normal inner circular edge.
10. Exact outer circular perimeter.
11. Solid matching backer.

Use the approved vector and polygon libraries where useful.

**Deliverable:** Pieces 2 and 3, visually and geometrically matching the intended product.

## Phase 6 — Interactive Parameters and Composition

Add:

- Tile size
- Frame diameter
- Ring width
- Family-name buffer
- Font controls
- Layout scoring controls
- Preview layers
- Overflow detection
- Regeneration controls

**Deliverable:** Fully configurable design preview.

## Phase 7 — Production Export

Implement:

- Three independent SVG exports
- Optional combined SVG
- Separate cut, score, engrave operations
- Font outlines
- Exact physical dimensions
- LightBurn compatibility checks

**Deliverable:** Laser-ready production files.

## Phase 8 — Project Workflow

Implement or refine:

- Customer/project search
- Save
- Duplicate
- Reopen
- JSON import/export
- Optional autosave
- Optional customer proof image export

**Deliverable:** Practical production workflow for repeated customer orders.

## Phase 9 — Validation and Physical Testing

Validate all geometry and export assumptions.

Perform representative laser-cut tests.

Tune defaults based on actual materials and finished product appearance.

Automated tests should be developed alongside each phase rather than postponed until Phase 9.

---

# 22. Later Features — Outside Initial V1 Scope

Potential additions include:

- Moving the entire connected crossword as one object within the frame
- A curved bottom edge for the frame opening, replacing the V1 straight line (added 2026-11-13, CHG-0003)
- Manual individual-name positioning
- Name rotation and locking
- More elaborate decorative artwork libraries
- Automatic nesting of pieces on available sheet material
- Material consumption estimates
- Laser time estimates
- Product pricing calculations
- Customer approval proofs
- Blender-based 3D product previews
- Batch order generation
- Public-facing Sloth & Llama product customizer

These should not delay completion of a working initial laser-cutting application.

---

# 23. Important Implementation Principles

## 23.1 Do not confuse engraving with cutting

Letters, punctuation, decorative images, family names, and years are engraved.

Tile boundaries are scored.

Physical perimeters are cut.

## 23.2 Do not create three independent crossword pieces

The crossword itself is one unified piece.

The frame is a second piece.

The backer is a third piece.

## 23.3 Do not simplify the family-name frame incorrectly

The family name is not merely printed inside a conventional ring.

Its surrounding wood is physically part of the ring's geometry.

The inner cut must reflect the smooth buffered upper silhouette of the engraving.

## 23.4 Do not introduce unsupported automatic connectors

No connector chains.

Only one connector tile between names.

Only perpendicular name connections.

## 23.5 Do not treat punctuation as decorations

Apostrophes and hyphens are actual name characters and occupy ordinary tiles.

Matching punctuation can intersect.

## 23.6 Do not automatically alter requested physical sizes

An overflowing layout can be shown.

The user decides whether to resize the frame or the tiles.

## 23.7 Do not overcomplicate manual editing in V1

Manual additions are restricted to decorative or blank tiles at word boundaries.

No individual-name editing or locking is required.

## 23.8 Keep geometry deterministic and reusable

The exact same layout and settings should produce the same cutting and engraving geometry.

The browser preview and exported artwork should derive from a common geometry representation.

---

# 24. Items Not Yet Fully Finalized

These are matters for implementation or subsequent planning, not reasons to ignore the agreed requirements.

1. **Exact default physical dimensions:** The suggested initial tile size is 12.7 mm, but actual product defaults require testing.
2. **Default circular diameter and ring width:** Configurable; final defaults not yet selected.
3. **Font choices:** Need commercially appropriate fonts and testing for visual quality. Fonts must also cover the accented letters allowed by §5.3 (added 2026-11-13).
4. **Detailed envelope algorithm:** Settled in outline by the 2026-11-13 amendment to §3.3. The exact smoothing parameters remain to be tuned through prototyping.
5. **Exact family-name/year positioning controls:** The frame geometry supports these, but UI details remain open.
6. **Custom SVG restrictions:** Define supported SVG features and import validation.
7. **Candidate count:** The solver will provide multiple layouts; the exact default number is not yet fixed.
8. **Default solver search budgets:** Quick/Balanced/Thorough behavior needs performance testing.
9. **Manual whole-crossword dragging:** Desired in a future version, not part of initial V1 manual editing.
10. **SVG color assignments:** To be configured and verified against the user's LightBurn workflow.

Where these details are unresolved, use sensible configurable defaults and retain the ability to refine them without changing the architecture.

---

# 25. Repository Setup

Target location:

`~/projects/codemavens/crossword-generator`

Create a local Git repository if one does not exist.

Do not create or connect a GitHub remote unless explicitly requested.

Suggested organization:

```text
crossword-generator/
├── README.md
├── docs/
│   ├── SPEC.md
│   ├── SOLVER.md
│   ├── GEOMETRY.md
│   └── DEVELOPMENT.md
├── src/
│   ├── app/
│   ├── components/
│   ├── models/
│   ├── solver/
│   ├── geometry/
│   ├── typography/
│   ├── artwork/
│   ├── export/
│   └── persistence/
├── server/
│   ├── api/
│   └── database/
├── tests/
│   ├── solver/
│   ├── geometry/
│   └── export/
├── public/
│   └── artwork/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .gitignore
```

Adjust the structure as appropriate for a maintainable Vite/React project.

Do not introduce additional packages without approval.

Use a suitable `.gitignore` that excludes runtime database files, build outputs, temporary exports, dependencies, and development artifacts.

Commit the initial specification and application foundation to Git.

---

# 26. Definition of Done for V1

V1 is complete when the following workflow is possible:

1. Open the local web application.
2. Create a new customer project.
3. Enter the family name, optional year, and individual names.
4. Select a frame diameter and tile size.
5. Generate several crossword arrangements.
6. Review the candidates and their scores.
7. Choose a preferred arrangement.
8. Add or edit optional decorative tiles at name boundaries.
9. Select different artwork for individual decorative tiles.
10. Preview the complete three-piece product.
11. Verify that the family-name section is smoothly welded into the lower inner edge of the circular frame.
12. Adjust the text buffer, ring width, tile size, and other parameters.
13. Identify and correct any frame-fit problems.
14. Export the three physical pieces as vector SVGs.
15. Import the SVGs into LightBurn with correct dimensions and distinct cutting, scoring, and engraving operations.
16. Save the complete customer project to SQLite.
17. Reopen the project later and reproduce the same design.

The finished result should be visually faithful to the original Sloth & Llama reference design and suitable for producing an actual layered wooden product.

---

# 27. Instructions for the Implementing Agent

Use this document as the authoritative current project specification.

In particular:

- Respect the user's approved architecture and libraries.
- Do not silently add dependencies.
- Do not reinterpret the welded family-name frame as a separate plaque.
- Keep the circular frame's exterior perfectly round.
- Implement the smooth rubber-band inner contour around the family-name engraving.
- Treat the three wooden components as distinct physical pieces.
- Apply the approved crossword connection rules.
- Respect configurable scoring weights, including the current default visual-balance weight of **35**.
- Use SQLite for local project persistence.
- Preserve the distinction between structural validation and physical fit warnings.
- Favor independently testable modules.
- Implement and test the project incrementally, phase by phase.

**The objective is not merely to generate a visually plausible crossword preview. The objective is to generate accurate, repeatable, production-ready laser-cut artwork for Sloth & Llama.**