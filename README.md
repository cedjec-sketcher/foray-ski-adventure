# Foray Ski Adventure — Japan Snowpack

A single-page map of 20 Japanese ski resorts (Hokkaido to Nagano) on a real,
pannable/zoomable [Leaflet](https://leafletjs.com/) + OpenStreetMap map,
showing live snow depth and temperature from
[Open-Meteo](https://open-meteo.com) (fetched directly in the browser), with
an illustrative typical-season pattern (Dec–Apr) for each resort.

- Marker **size** = snow depth (area-scaled, not radius)
- Marker **color** = temperature (diverging, centered on 0°C)
- A resort with 0cm renders as a small hollow ring rather than a filled dot
- Dark mode uses a CSS filter on the same OpenStreetMap tiles rather than a
  second tile provider — see ARCHITECTURE.md for why

## Files

- `index.html` — the built, ready-to-open page (also the GitHub Pages entry point)
- `template.html` — the source template; has a `__SKI_DATA_JSON__` placeholder
  where the data gets spliced in
- `data/resorts.json` — resort metadata (name, region, coordinates, elevation,
  typical peak depth, typical winter temperature range) — edit this to add or
  adjust resorts
- `data/ski_data.json` — generated output (live snow/temp fetch + seasonal
  curves); this is what `index.html` embeds
- `scripts/build_data.rb` — fetches live conditions from Open-Meteo, generates
  the illustrative seasonal curves, and rebuilds `index.html` from
  `template.html`

## Regenerating the data

Requires Ruby (ships with macOS, no gems needed):

```bash
ruby scripts/build_data.rb
```

This refreshes `data/ski_data.json` with a fresh live snow/temperature fetch
and rewrites `index.html`.

## Viewing it locally

```bash
ruby -run -e httpd . -p 8000
```

Then open <http://localhost:8000/index.html>.

## Next steps

- **Daily snapshots**: a scheduled GitHub Actions workflow that runs
  `scripts/build_data.rb` daily and commits the result would turn the
  "typical season" chart into real recorded history over a winter.

## Data sources

- Live snow depth and temperature: [Open-Meteo](https://open-meteo.com) —
  free for non-commercial use with attribution; see their
  [terms](https://open-meteo.com/en/terms) before any commercial use.
- Map tiles: [OpenStreetMap](https://www.openstreetmap.org/copyright) —
  free, with an acceptable-use policy for the public tile server (fine for
  this project's traffic).

## License

[MIT](./LICENSE) — see the LICENSE file. This covers the code in this repo;
it doesn't change the terms of the third-party data sources listed above.

## More docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the build pipeline and
  the client-side rendering fit together, and why it's shaped this way
- [docs/PROPOSALS.md](docs/PROPOSALS.md) — proposed improvements to code
  structure, data-source/map flexibility, and test coverage
