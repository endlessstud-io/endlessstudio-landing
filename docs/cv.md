# Javier Abia — illustrated CV

Open `/cv/` to read the CV. The home page menu links to it. The layout follows
Javier's reference from 19 October 2026: warm paper, an oversized name, a serif
role beside the profile, bold condensed project headings, fine column rules and
a centered email footer. Colour comes mainly from the project images.

The full CV uses three A4 pages so every named project has its own screenshot
and the body text remains readable. Fonts and images are local.

## Editing the content

Edit **`src/content/cv.md`**. The YAML frontmatter holds the name, role, contact
links and description metadata. `github` controls the top-left header link; it
currently points to `https://github.com/weberjavi`.

The body is ordinary Markdown. The `##` headings identify layout slots; the
visible project titles are `###` headings. To rename a title, change the `###`
line, keeping the `##` key. Project entries contain the title, role/date paragraph,
image, description and an italic line for the stack. The recorded OpenJS talk
appears as a Markdown blockquote within Global Fishing Watch.

Images live directly in the Markdown, so replacing one needs no template edits:

```md
[![Description of the project screenshot](/projects/example.webp)](https://example.com)
```

Use `![Description](/projects/example.webp)` for an image without an external
link. Add the image file under `public/projects/`; its URL starts `/projects/`.
Images have the same height in neighbouring columns and are cropped slightly to
fit. On mobile they retain a 2:1 aspect ratio.

| Page | Content slots |
| --- | --- |
| 1 | Profile, Current heading, Global Fishing Watch, Tree Equity Score |
| 2 | Current exploration (archaeo.studio), Half-Earth, Trase, Climate Watch |
| 3 | Earlier experience, Toolkit, Academic background |

Pages 1 and 2 form one Projects section; the page break does not introduce an
employer grouping. Company names appear in each project's metadata.
archaeo.studio is the third project; all six projects have an image.

Page 3 has three stacked, full-width sections. Each `###` title is followed by
ordinary Markdown paragraphs, one per small card. Start each card with a bold
label; use two trailing spaces for line breaks within the card and a blank line
to start the next one. Cards form two columns on paper and one on narrow screens.

All project entries, Earlier experience, Toolkit and Academic background are optional. Remove
an entire section or leave it empty to omit it without an error or an empty
project box. Keep Profile and the single-line heading section `Current heading`. Missing required metadata
or headings and duplicate sections produce an explicit error.

The download at `/cv/javier-abia.md` is generated from the same source, including
frontmatter. `npm run dev` updates the preview while editing. Layout and
typography live in `src/styles/cv.css`; the template is
`src/pages/cv/index.astro`. Shared print headers and footers are in
`src/components/cv/`.

The landing page reads project card copy through `src/lib/landing-cv.ts`, while
retaining its chronological stops, year labels, first-person narrative, layout
and interactions. Project card descriptions, metadata, stack labels and the
Global Fishing Watch talk come from this Markdown. The narrative and its History
milestone are edited in `src/components/MenuTimeline.astro`. Keep project metadata
as role, company and dates on three separate Markdown lines. The CV page order
and background card layouts are specific to `/cv/`. The older experimental
bio/story menus are independent.

## Printing and exporting

Use **Print / save PDF** on the page. Select **A4**, **100% scale**, disable browser
headers and footers, and enable background graphics if your browser needs that
setting. Print CSS provides page breaks, hides document actions, and preserves
text and links. Printing from mobile still uses A4.

For a reproducible PDF and three page previews:

```sh
npm run cv:pdf
```

This builds the current content, serves the build on an ephemeral loopback port,
and writes `artifacts/javier-abia-cv.pdf` and `artifacts/cv-page-1.png` through
`cv-page-3.png`. The exporter checks asset loading, page dimensions, horizontal
overflow and the final three-page count, then closes its server and browser.
It does not clip overflowing copy or shrink it silently. Export again after
substantial edits to check the page fit. Generated artifacts are ignored by Git.

The exporter uses Playwright Chromium when available, otherwise installed Google
Chrome. If neither is installed, run `npx playwright install chromium`. A custom
browser executable can be supplied with `CV_CHROME_PATH`.

## Content and image provenance

The CV is based on Javier's supplied LinkedIn experience HTML and this site's
`MenuBio.astro`, `MenuTimeline.astro` and `src/data/projects.ts`. The first-page
project role labels and Tree Equity Score dates follow his 19 October reference.
The remaining dates and descriptions retain the previously supplied content.
Academic background uses Javier's LinkedIn education and courses HTML supplied
on 19 October 2026: Ironhack (2016), Universidad Autónoma de Madrid (2010–2012),
Universidad de Santiago de Compostela (2006), and three GIS courses grouped in
one card. Course dates were not supplied and are omitted. Qualification titles
and descriptions are translated into English; `Licenciatura` is retained.

The copy remains tailored to Kpler's
[Senior Data Visualisation Engineer role](https://jobs.lever.co/kpler/15474088-c317-42ba-bb01-502a4b1617d3),
reviewed on 16 October 2026, with emphasis on maritime and commodity data, spatial
interfaces, Python validation, AI-assisted engineering and technical leadership.

Images use the site's existing project assets under `public/projects/`: the
Global Fishing Watch and archaeo.studio video posters; the Tree Equity Score,
Trase and Climate Watch images originating in the LinkedIn work archive. The
Half-Earth image, `half-earth-cameroon.webp`, is a screenshot of the map over
Cameroon Javier supplied on 23 October 2026, cropped to 2:1 at 1600×800; its
original is in `media/` (see `media/README.md`). See the
provenance comments in `src/data/projects.ts`. The older 160px LinkedIn thumbnails
remain in `public/cv/images/`, with their original source IDs in `SOURCES.md`.
The layout uses the larger site assets to keep the printed images clearer.

Barlow Condensed, DM Sans and Instrument Serif are self-hosted from Google Fonts.
Their SIL Open Font Licenses are included in `public/cv/fonts/`.
