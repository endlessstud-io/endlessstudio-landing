# Source screenshots

Originals behind the project cards and the CV, kept so the derived images and videos in `public/projects/` can be
rebuilt. This folder isn't served with the site.

| File | Shows | Source | Used for |
| --- | --- | --- | --- |
| `half-earth-globe.png` | Half-Earth Project Map, the globe with biodiversity layers | `he.png` in `endlessstudio/conversaciones/kpler-cv/assets/work` (LinkedIn project media) | Half-Earth loop, first frame and poster |
| `half-earth-cameroon.webp` | Half-Earth, Cameroon's biodiversity pattern and protection | [Bluesky](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:pvfu7bzzkohedevrhfxeo6bx/bafkreia2wj4xbcyucbvtpoq4fi3etr7jaktov3su6wx45yj2xpl7y5hxea) | Half-Earth loop; the CV's still (`half-earth-cameroon.webp`) |
| `half-earth-california.webp` | Half-Earth, species richness over California | [Bluesky](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:pvfu7bzzkohedevrhfxeo6bx/bafkreihbpq57pzizdlec2q3vlt2aylubuk3obpvuvmdlxe26uetft3pfnq) | Half-Earth loop |
| `tree-equity-jersey-city-score.webp` | Tree Equity Score National Explorer, the score over Jersey City | [Bluesky](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:pvfu7bzzkohedevrhfxeo6bx/bafkreih5v7etqx436xv3efj4nvkofotdsrxscf6mawiduk5jcbvit2wu3m) | Tree Equity Score loop, first frame and poster |
| `tree-equity-new-york-heat.webp` | Tree Equity Score National Explorer, heat disparity over New York | [Bluesky](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:pvfu7bzzkohedevrhfxeo6bx/bafkreifk6vroxwomn77guwh3oqkn36fx2pkkelvp5f3646r3aktfmskrqm) | Tree Equity Score loop |
| `tree-equity-boston-analyzer.webp` | Tree Equity Score Analyzer, planting trees on a Boston parcel | [Bluesky](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:pvfu7bzzkohedevrhfxeo6bx/bafkreib75lpp7242hqmq3c7f7cgrdyqoilxmjge2qsccc7ehgvoxxrj64u) | Tree Equity Score loop |
| `marxan-kenya.jpg` | Marxan Cloud, a Kenya National scenario's solutions | LinkedIn project media | Marxan card (`marxan-kenya.webp`, centre-cropped to 2:1) |

All were supplied by Javier on 23 October 2026.

Rebuild the loops with `scripts/encode-map-loop.sh`:

```sh
scripts/encode-map-loop.sh public/projects/half-earth-maps.mp4 public/projects/half-earth-maps-poster.webp \
  media/half-earth-globe.png media/half-earth-cameroon.webp media/half-earth-california.webp
scripts/encode-map-loop.sh public/projects/tree-equity-maps.mp4 public/projects/tree-equity-maps-poster.webp \
  media/tree-equity-jersey-city-score.webp media/tree-equity-new-york-heat.webp media/tree-equity-boston-analyzer.webp
```
