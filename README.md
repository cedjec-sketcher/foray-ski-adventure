# Foray Ski Adventure — Japan Snowpack

A single-page map of 20 Japanese ski resorts (Hokkaido to Nagano), showing live
snow depth and temperature from [Open-Meteo](https://open-meteo.com), with an
illustrative typical-season pattern (Dec–Apr) for each resort.

- Marker **size** = snow depth (area-scaled, not radius)
- Marker **color** = temperature (diverging, centered on 0°C)
- A resort with 0cm renders as a small hollow ring rather than a filled dot

## Files

- `index.html` — the built, ready-to-open page (also the GitHub Pages entry point)
- `template.html` — the source template; has a `__SKI_DATA_JSON__` placeholder
  where the data gets spliced in
- `data/resorts.json` — resort metadata (name, region, coordinates, elevation,
  typical peak depth, typical winter temperature range) — edit this to add or
  adjust resorts
- `data/japan_boundary.geojson` — simplified national outline used to draw the
  map, extracted from [Natural Earth](https://www.naturalearthdata.com/)'s
  1:110m admin-0 countries dataset (public domain)
- `data/ski_data.json` — generated output (live snow/temp fetch + projected
  coordinates + seasonal curves); this is what `index.html` embeds
- `scripts/build_data.rb` — fetches live conditions from Open-Meteo, projects
  resort coordinates onto the map, generates the illustrative seasonal curves,
  and rebuilds `index.html` from `template.html`

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

- **GitHub Pages**: enable it in repo Settings → Pages, serving from the `main`
  branch root, to get a real hosted URL with live map tiles and live fetches
  (the sandboxed Claude Artifact version can't do either).
- **Daily snapshots**: a scheduled GitHub Actions workflow that runs
  `scripts/build_data.rb` daily and commits the result would turn the
  "typical season" chart into real recorded history over a winter.

## Data sources

- Live snow depth and temperature: [Open-Meteo](https://open-meteo.com) —
  free for non-commercial use with attribution; see their
  [terms](https://open-meteo.com/en/terms) before any commercial use.
- National outline: [Natural Earth](https://www.naturalearthdata.com/)
  1:110m admin-0 countries — public domain, no attribution required.

## License

[MIT](./LICENSE) — see the LICENSE file. This covers the code in this repo;
it doesn't change the terms of the third-party data sources listed above.

## More docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the build pipeline and
  the client-side rendering fit together, and why it's shaped this way
- [docs/PROPOSALS.md](docs/PROPOSALS.md) — proposed improvements to code
  structure, data-source/map flexibility, and test coverage
