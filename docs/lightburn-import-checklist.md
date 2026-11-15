# LightBurn import checklist

Use this to check that the exported files import into LightBurn correctly. It takes about 15 minutes. Nothing here has been checked yet. Please fill in the results table at the end.

## 1. Export the files

1. Open a project in the app. Make sure an arrangement is chosen and the preview looks right.
2. Open the **Size and fit** panel under the preview. Write down the tile size, the frame diameter and the crossword size.
3. Go to the **Export** section. Leave the colours as they are (Cut red, Score blue, Engrave black).
4. Click **Download all three**. You should get three files, for example `The-Sanders-crossword.svg`, `The-Sanders-frame.svg` and `The-Sanders-backer.svg`. Your browser may ask once whether to allow several downloads. Say yes.
5. Note the size shown next to each download button.

## 2. Import each file

Do this once for each file. Start a new LightBurn project for each one, so the pieces do not mix.

1. In LightBurn, choose **File → Import** and pick the file.
2. If LightBurn asks about units or scale, choose millimetres and 100% (no scaling).
3. Select everything (Ctrl+A or Cmd+A) and read the width and height in the toolbar at the top.

## 3. What to check

**Size.** Each file has a 1 mm border around the drawing. So the drawing in LightBurn should be 2 mm smaller than the size shown in the app, in both directions (give or take 0.1 mm for line width).

- Crossword: about the crossword size from the Size and fit panel.
- Frame: the frame diameter.
- Backer: the frame diameter, the same as the frame. The blue placement mark sits inside it, at the crossword's position.

**Three colours, three layers.** LightBurn should show one layer per colour in the Cuts / Layers window:

| Colour | Operation | Suggested mode | Notes |
| --- | --- | --- | --- |
| Red `#FF0000` | Cut | Line | Full power, cuts right through. |
| Blue `#0000FF` | Score | Line | Low power, marks the lines between tiles. Should not cut through. |
| Black `#000000` | Engrave | Fill | Letters, point values, pictures, family name and year. |

The backer has red (the circle) and blue (the crossword placement mark, see below). The frame has red and black. The crossword has all three.

**Cut order.** Engrave first, then score, then inner cuts and holes, then the outer cut last. This stops the piece from moving before the work on it is done. In LightBurn, put the layers in this order, and turn on **Optimization Settings → Cut inner shapes first**.

**Frame outer edge.** Click the frame's outer edge. It should be one clean circle, not many short lines. The inner cut should be a single closed shape.

**No doubled lines.** Click along a few cut and score lines. Each should select only one line. Doubled lines burn twice and leave a wider, darker mark. In LightBurn, **Edit → Select Duplicates** helps here: it should find nothing.

**Text is shapes.** The letters should be shapes, not editable text. LightBurn should not warn about missing fonts.

## 4. If something is off

Send back:

- Which file and which check failed.
- A screenshot of LightBurn showing the problem, with the Cuts / Layers window visible.
- The width and height LightBurn shows, and the size the app shows.
- The `.svg` file itself.
- Your LightBurn version (Help → About).

## 5. Results

Fill this in as you go. Use ✓, ✗ or a short note.

| Check | crossword.svg | frame.svg | backer.svg |
| --- | --- | --- | --- |
| Imports without errors or warnings | | | |
| Size matches the app (less 2 mm) | | | |
| Red layer present, Line mode | | | |
| Blue layer present, Line mode at low power | | n/a | |
| Backer mark: closed blue outline of the crossword, about 1 mm inside its edge, holes marked larger | n/a | n/a | |
| Black layer present, Fill mode | | | n/a |
| No other colours or layers | | | |
| Cut order set: engrave, score, inner, outer | | | |
| Outer edge is one clean circle | n/a | | |
| No doubled lines | | | |
| Text is shapes, no font warning | | | n/a |

Date checked: ________  LightBurn version: ________  Checked by: ________
