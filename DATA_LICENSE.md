# Data licence

The [MIT licence](./LICENSE) covers the **code** in this repository. The
**data** has its own terms, because most of it comes from other people's
open datasets. This file says which files are under which terms. It is a
plain-language summary; the licences linked below are what actually govern.

## Resort data: ODbL

These files contain resort names, locations, elevations, run lengths and lift
counts taken from [OpenSkiData / OpenSkiMap](https://openskimap.org), which is
itself derived from OpenStreetMap:

- `data/resorts.json`
- `data/ski_data.json`
- the copy of `ski_data.json` embedded in `index.html`

They are made available under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/),
the same licence the source data is under.

Attribution, as OpenSkiData asks for it:

> Data from OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors (ODbL),
> Skimap.org, Who's On First, © Mapterhorn

If you reuse these files:

- keep that attribution;
- if you share a modified version of the data, share it under the ODbL too
  (that is the "share-alike" condition);
- the ODbL applies to the data, not to your code, so this does not force
  anything you build with it to be open.

Each imported resort carries the OpenSkiMap id it came from (`osm_id`, or
`osm_ids` for the hand-picked resorts that absorb several areas), so entries
can be traced back to the source. Where an entry was edited by hand (a
cleaned-up name, a hand-placed coordinate) it is still treated as part of the
same database.

## Live conditions: CC BY 4.0

The snow depth, temperature and weather-code values (in `data/ski_data.json`,
the embedded copy in `index.html`, and `data/fixture_conditions.json`) come
from [Open-Meteo](https://open-meteo.com), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit:
"Weather data by [Open-Meteo.com](https://open-meteo.com/)". Open-Meteo's free
tier is for non-commercial use; see [their terms](https://open-meteo.com/en/terms).

## Everything else: MIT

`data/illustrative_curve_tuning.json` and `config/season.json` are this
project's own, as are the illustrative typical-season curves generated from
them. They are under the same MIT licence as the code.

## Map tiles

The map tiles are © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, loaded live from the public OpenStreetMap tile server; they are
not part of this repository.
