# Physical test checklist

Use this to tune the default values with real cuts. The defaults in the app are first guesses. They have not been tested on a laser. Nothing in this document has been done yet. Please fill in the results tables.

Do the [LightBurn import checklist](lightburn-import-checklist.md) first, so you know the files import correctly.

## Before you start

- **Kerf.** Kerf is the width of the material the laser burns away when it cuts. The app does not compensate for kerf. A cut shape comes out slightly smaller than drawn, and a hole slightly larger. Measure it in Test 1 and write it down. Then allow for it when you judge fits.
- **Material and machine settings.** Use the wood you will sell. Write the thickness and the machine settings you used in each table. This document gives no power or speed values. They depend on your machine and material.
- **Tools.** Callipers that read to 0.1 mm or better, and a ruler.
- **One change at a time.** Change one setting between cuts, so you know which change made the difference.
- **Name the files.** Put the test number in the project name (for example `Test 2 crossword`). The project name starts the file names.

The app default values are listed here for reference. They come from the code (`src/core/models/defaults.ts`).

| Setting (control name in the app) | Default |
| --- | --- |
| Tile size (mm) | 12.7 |
| Letter size (% of tile) | 55 |
| Show point values | on |
| Outer diameter (mm) | 300 |
| Ring width (mm) | 8 |
| Family name font size (mm) | 20 |
| Year font size (mm) | 14 |
| Name buffer (mm) | 2.5 |
| Outline: close ↔ loose | 0.2 on the slider (range 0 to 1) |
| Bottom line height (mm) | 26 |
| Name drop below line (mm) | 5 |
| Bottom corner radius (mm) | 12 |
| Gap between crossword and frame (mm) | 5 |
| Family name font | Pacifico |
| Year font and Tile letter font | Zilla Slab SemiBold |

## Test 1: tile-size strip

**Purpose:** find the smallest tile size where letters and point values are still clear. Measure kerf.

**Export.** Make a project with one short name, for example `SAM`. Generate and choose the arrangement. Set **Tile size (mm)** to 10 and export `crossword.svg`. Repeat at 12.7, 15 and 20. Four cuts in total. If the app says the crossword does not fit the frame, tick "Export anyway". That is fine for a test. Do not use the **Largest that fits** button here, because it would change the tile size.

**Check, for each size:**

- Tile size with callipers (width of one tile, edge to edge). Compare with the size you set. The difference is about one kerf.
- Score line: is it visible? Is it deep enough to see, and not cut through? Is it the same on every tile edge?
- Letters: are they clear at arm's length?
- Point values: are the small digits in the lower-right corner readable? Do they touch the letter?
- Edges: are tile edges straight and square at the corners?

**If it is off:**

| Problem | Change |
| --- | --- |
| Letters too small or too large in the tile | **Letter size (% of tile)** |
| Point values too small to read at the smallest tile size | Use a larger **Tile size (mm)**, or turn off **Show point values** |
| Score line too faint or too deep | Laser settings for the Score layer in LightBurn (not an app setting) |
| Tile size is wrong after allowing for kerf | **Tile size (mm)**. Write the kerf in the table. |

| Tile size set (mm) | Measured (mm) | Kerf estimate (mm) | Score line OK? | Letters clear? | Point values clear? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | | | | | | |
| 12.7 | | | | | | |
| 15 | | | | | | |
| 20 | | | | | | |

Decision: smallest tile size you accept: ________ mm. Kerf: ________ mm.

## Test 2: crossword with a hole and a single-tile connector

**Purpose:** check thin joins, holes, and pictures.

**Export.** Use four or five names, for example `ANNA`, `ELLA`, `SAM` and `SUE`. Generate. Pick an arrangement that has a single-tile connector (a tile after a name that joins two names). If possible, choose one where the names form a loop around an empty square, so the crossword has a hole. Use the tile size from Test 1. Add a decorative tile with each of the six built-in pictures. Add them to different names, with **Edit end tiles**. Export `crossword.svg`.

If the arrangement has no hole, say so in the table. You may need to try other arrangements or other names.

**Check:**

- Thin joins: find places where two parts of the crossword meet only along one tile edge. Is the join strong? Does it break when you handle the piece?
- Hole: is the hole clean? Is the inside corner clear of burn marks? Does the backer show through correctly when you place the piece on a backer?
- Score lines between tiles: one line per tile edge, no doubled burn marks.
- Each built-in picture: is the engraving clear? Are small details (paw toes, cat whiskers, cow spots) readable, or filled in?
- Pictures sit inside their tile with space around them.

**If it is off:**

| Problem | Change |
| --- | --- |
| Thin joins are weak | Choose another arrangement in **Arrangement**, or use a larger **Tile size (mm)**. The app does not strengthen joins. |
| Pictures too detailed at this size | Use a larger **Tile size (mm)**, or pick another picture in the tile editor |
| Doubled lines or burn marks | Check **Edit → Select Duplicates** in LightBurn. If it finds something, send the file back. |

| Item | Result | Notes |
| --- | --- | --- |
| Arrangement had a hole? | | |
| Joins strong enough? | | |
| Heart engraving clear | | |
| Star engraving clear | | |
| Paw print engraving clear | | |
| Spade engraving clear | | |
| Cat face engraving clear | | |
| Cow engraving clear | | |

## Test 3: small frame with a short and a long family name

**Purpose:** check the family-name bridge, the buffer and the ring width.

**Export.** Make two projects with a small outer diameter, for example 150 mm (set **Outer diameter (mm)**). Add at least one name and choose an arrangement, because export needs one. In the first, set **Family name** to a short name, for example `Lee`, with year `2026`. In the second, use a long name, for example `The Montgomery-Sanders`. Export `frame.svg` for each. Use the default settings first.

**Check:**

- Ring width: is the ring strong enough? Measure it. Does it match **Ring width (mm)**, after allowing for kerf?
- Family name: are the letters inside the wood, with wood around them? Are thin parts of the letters, such as the thin strokes of Pacifico, engraved clearly?
- Name buffer: is the wood between the letters and the inner cut wide enough to be strong? Measure the narrowest part.
- Bridge: the inner cut should follow the top of the name like a rubber band. Check that the name is joined to the ring by a strong band of wood, with no thin necks.
- Year: is it clear and inside the frame?
- Does the long name fit without leaving the frame? If it does not, the app shows a warning in the **Frame** section.

**If it is off:**

| Problem | Change |
| --- | --- |
| Ring too thin or too wide | **Ring width (mm)** |
| Wood around the letters too thin | **Name buffer (mm)** |
| Opening follows the name too closely or too loosely | **Outline: close ↔ loose** |
| Name too big or too small | **Family name font size (mm)** |
| Name too high or too low in the frame | **Name drop below line (mm)** and **Bottom line height (mm)** |
| Corners of the bottom edge too sharp or too round | **Bottom corner radius (mm)** |
| Year too big or too small | **Year font size (mm)** |
| Letters too thin to cut well | **Family name font** (try another font) |

| Item | Short name | Long name | Notes |
| --- | --- | --- | --- |
| Ring width set (mm) | | | |
| Ring width measured (mm) | | | |
| Narrowest wood near letters (mm) | | | |
| Bridge strong? | | | |
| Name clear? | | | |
| Year clear? | | | |

## Test 4: backer

**Purpose:** check the backer diameter and that the three layers match.

**Export.** Export `backer.svg` from one of the Test 3 projects. Cut it. Also use the `frame.svg` cut from Test 3 and the `crossword.svg` from Test 2, if they match in size. Otherwise do the full test with Test 5.

**Check:**

- Backer diameter with callipers. Compare with **Outer diameter (mm)**. The difference is about one kerf.
- Place the frame on the backer. Do the outer edges line up? Measure the difference at four points.
- Is the backer one clean circle?
- Place the crossword on the backer. Does it cover the blue score outline (about **Backer mark inset (mm)** inside its edge) with no line showing at the edge or in the holes? Adjust the inset in Export if the line shows or is too faint to use.

**If it is off:**

| Problem | Change |
| --- | --- |
| Frame and backer differ in size by more than you accept | The app does not compensate for kerf. Change **Outer diameter (mm)** by the kerf, or fix kerf in LightBurn. |

| Item | Result | Notes |
| --- | --- | --- |
| Backer diameter set (mm) | | |
| Backer diameter measured (mm) | | |
| Frame diameter measured (mm) | | |
| Edge difference when stacked (mm) | | |

## Test 5: full three-layer set

**Purpose:** check the whole product, including how the crossword sits in the opening.

**Export.** Make one real-looking project with 4 to 6 names, a family name and a year. Use the tile size and frame values you chose in the tests above. Generate and choose an arrangement. Check **Size and fit** and make sure it says "Fits inside the frame." Export all three files. Cut all three. Glue them in the order: backer, frame, crossword.

**Check:**

- Crossword in the opening: does the crossword sit inside the opening with room on all sides? The default **Gap between crossword and frame (mm)** is 5 mm. Measure the smallest gap. Does it look balanced?
- Alignment: frame on backer, as in Test 4.
- Crossword position: does the position in the preview match the real piece? If you moved the crossword, does the real position match?
- Overall: is the result what you want to sell?

**If it is off:**

| Problem | Change |
| --- | --- |
| Gap to the frame too small or too large | **Gap between crossword and frame (mm)** |
| Crossword too big or too small in the opening | **Tile size (mm)**, or the **Largest that fits** button |
| Frame too big for the crossword | **Outer diameter (mm)**, or the **Smallest that fits** button |
| Crossword not centred | Drag it in the preview, or press **Centre** |

| Item | Result | Notes |
| --- | --- | --- |
| Smallest gap, crossword to frame (mm) | | |
| Layers aligned? | | |
| Looks like the preview? | | |

## Colours

Also check the operation colours against your LightBurn layers. This is part of the [LightBurn import checklist](lightburn-import-checklist.md). If your layers use other colours, change them in the **Export** section. They are saved with each project.

## Summary of decisions

When all tests are done, write down the values to use as the new defaults. Send them back so the defaults in the app can be changed.

| Setting | Chosen value |
| --- | --- |
| Tile size (mm) | |
| Letter size (% of tile) | |
| Show point values | |
| Outer diameter (mm) | |
| Ring width (mm) | |
| Name buffer (mm) | |
| Family name font and size | |
| Year font and size | |
| Tile letter font | |
| Gap between crossword and frame (mm) | |
| Operation colours | |
| Kerf (mm) | |

Date: ________  Material and thickness: ________  Machine: ________  Checked by: ________
