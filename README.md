# withnate-colouring-page

Turn a photo into a colouring page: black outlines on white paper, with a detail slider, and a
download laid out on A4 at 300 dpi ready to print.

**Runs entirely in the browser.** No upload, no AI service, no credits, no account, no storage.
Built for [withnate.co.uk](https://withnate.co.uk/tools/colouring-page/) as a drop-in: one IIFE, one
stylesheet, and a demo page.

MIT licensed.

## How it finds the lines

A difference of Gaussians: the picture is blurred twice, at a small and a slightly larger radius,
and the two are subtracted. Where brightness changes, the two blurs disagree, and on the dark side of
the edge the difference goes strongly negative; flat areas cancel out. Those pixels become the line.
It gives single, drawn-looking outlines rather than the doubled, noisy edges of a plain gradient
filter, and it needs no model.

Blobs of line smaller than a set size are then removed (8-connected flood fill), which clears the
speckle a camera sensor and fine texture leave behind. The detail slider changes the blur radius,
the line threshold and the smallest blob kept, together.

The work is done at no more than 1600 px on the long side, which is plenty for a page and keeps it
quick on a phone.

## Honest about what it is good at

Photos with a clear subject on a plain or soft background make the best pages: a pet on a sofa, a
toy, a building against the sky. A busy background, such as leaves, a crowd or gravel, turns into a
lot of small lines. Turning the detail down helps; cropping the photo first helps more.

## Things the code is shaped around

- **The megapixel ceiling is read from the header before decoding**, so an 80 MP+ file is refused
  with its size named before any memory is spent.
- **Transparent pixels count as white paper**, so a cut-out PNG does not get a black outline round
  the whole canvas.
- **The blur clamps at the edges**, so the border of the photo does not become a line.
- **The A4 page turns** to landscape for a wide picture, and the picture is always placed whole,
  centred, inside a 10 mm margin.
- **Races:** each run takes a ticket, so dragging the slider cannot leave a stale download.

## Integration

Mounts on `data-cp`; does nothing without it. Markup is in `src/markup.html` and `demo/index.html`.

| Attribute | Element | Role |
|---|---|---|
| `data-cp` | any | Mount point |
| `data-cp-drop` | any | Drop zone; must contain an `input[type=file]` |
| `data-cp-status` | any | Reading, working, refusals |
| `data-cp-controls` | any | Hidden until a photo loads |
| `data-cp-detail` | `input[type=range]` 1-5 | Detail level |
| `data-cp-detail-label` | any | Names the level |
| `data-cp-preview` | any | The line art |
| `data-cp-download-a4` | `a` | A4 page, 300 dpi PNG |
| `data-cp-download` | `a` | The line art alone, PNG |
| `data-cp-reset` | `button` | Clears the photo |

## Checks

- `npm test`: 14 tests over `src/plan.ts`, on synthetic pictures (flat, a hard edge, texture, specks).
- `npm run prove`: switches off each of the 10 guards in turn and confirms a test fails. All 10 do.
- `npm run smoke`: no network, no storage, no module syntax, no external URLs, silent with no root
  element, and only `.cp-` classes in the stylesheet.

## Built on

[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core), bundled in.

## Licence

MIT. See [LICENSE](LICENSE).
