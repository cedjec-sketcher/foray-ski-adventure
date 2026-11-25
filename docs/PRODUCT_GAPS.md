# Product gap analyses

Where the **product owner** role files its reports. The role is defined in
`.claude/agents/product-owner.md`: it compares Foray with other
ski-conditions apps and sites and proposes what's worth building. It never
edits files; the developer files each report here unchanged under a dated
heading. The owner decides which recommendations to act on, and those become
entries in [PROPOSALS.md](./PROPOSALS.md). See [WORKFLOW.md](./WORKFLOW.md),
"Roles".

Facts about other products are as read on the date of the report, with the
URL they came from. Prices and features change, so re-check before relying
on one.

---

## 2026-11-25 — Gap analysis: Japan now, Sweden/Norway next

(First gap analysis, so there is nothing earlier to compare against.)

### 1. Summary
- Foray gives the widest free overview of Japan: all 477 resorts on one map, with no ads and no account. But on the questions skiers bring in late November (is it open, how deep is it really, did it just snow, will it snow up top), every comparison product shows something Foray doesn't.
- The biggest gap is the data itself: resort-reported depth and lift status. It is blocked on permission or data, not on effort.
- Top 3 for the effort: (1) a forecast at the resort's real altitude, with freezing level, in the detail card; (2) per-resort links out to the resort's site, OpenSkiMap and SnowJapan; (3) "new snow" figures (the last 24-72 h, plus a "most snow coming" Top 10), as the existing Forecast proposal describes.
- The Nordic launch may be where Foray's numbers are most credible: the model tracks SMHI stations within about 10 cm (owner research, 2026-09-28).

### 2. Comparison set

Why these: two Japan specialists, three global condition sites, a forecast-first paid service, a Norwegian national service, a Swedish/Norwegian resort group, and a map-first app.

| Product | Audience | Data sources | Business model | URL |
|---|---|---|---|---|
| SnowJapan | English (and Japanese) skiers going to Japan | "Independent" daily snow reports, an official snow-depth chart, webcam centre, area guides, directory. Who collects the reports isn't stated on the pages read (project research says resort figures, with 14 seasons of archives) | "does not sell products or services"; limited advertising, which it says has no editorial influence | https://www.snowjapan.com/ , https://www.snowjapan.com/about |
| OnTheSnow (Mountain News / Skiinfo) | Global, US-centric | Base depth, lifts and runs open, 3-day snowfall and 3-day forecast, projected opening dates; user-posted reports; app has powder alerts, snow history graph, pass filters (Ikon/Epic), and SkiGPT | Free, with advertising and cross-app tracking (App Store label); sponsored content | https://www.onthesnow.com/japan/skireport , https://apps.apple.com/us/app/-/id300412347 |
| Snow-Forecast.com | Global powder-chasers | Forecast at top, mid and base elevations with freezing level; top/bottom depth (source not stated); user "Eyeball" reports; station observations; 3-day snow map; weekly Japan roundup | Ads, plus SnowPro ($7.99/mo or $29.99/yr: ad-free, 16-day and hourly forecasts, history) | https://www.snow-forecast.com/countries/Japan/resorts , https://www.snow-forecast.com/resorts/Niseko/6day/mid |
| OpenSnow | Forecast-first, US origin; Japan added Jan 2026 | Its own PEAKS model (refines standard models), 15-day maps; a human "Japan Daily Snow" forecaster three times a week; Japan snow report values marked "Estimated" | Subscription: Base $49.99/yr, Premium $99.99/yr; free account tier | https://opensnow.com/ , https://www.summitdaily.com/news/opensnow-launches-snow-forecasts-powder-skiing , https://opensnow.com/explore/countries/JP/snow-report |
| Skiresort.info (.com) | Global, Europe-centric | Resort-reported: top and base depth with altitudes, km of slopes open, lifts open (e.g. today Happo-one: 160 cm top / 18 cm base, 3 of 21 lifts). Test ratings; hotel and pass links | Advertising, partners, accommodation links | https://www.skiresort.com/en/snow-reports/japan/ |
| Mountainwatch (Grasshopper) | Australians skiing Japan | A weekly human-written Japan forecast built on ECMWF/WeatherBELL maps; per-resort weather, report and webcam pages | Free ("All for free"), with ads and travel promotions | https://www.mountainwatch.com/japan/hakkoda/weather , https://www.mountainwatch.com/?p=44772 |
| Fnugg (Norway) | Norwegian skiers; the national service for the resort association's members | Resort-reported depth at top and bottom, on and off piste; lifts and runs open; opening hours; webcams; Yr/MET forecast (Hemsedal today: 12/10 cm, 0 of 22 lifts). Has an API, but its terms bar use "in services that correspond to fnugg.no", require attribution and a link, and let Fnugg withdraw consent at any time | Not stated; tied to the trade association Norske alpinanlegg og fjelldestinasjoner | https://fnugg.no/ , https://fnugg.no/hemsedal/ , https://fnugg.no/artikler/api/ |
| SkiStar (Sweden/Norway) | Guests at Sälen, Åre, Vemdalen, Hammarbybacken, Trysil, Hemsedal | Its own measurements: fixed laser sensors plus groomer GPS depth; lift and piste maps; push alerts for lift openings; webcams | Resort operator: passes, lodging, packages, membership. The app is free | https://www.skistar.com/en/ , https://www.skistar.com/en/ski-destinations/salen/winter-in-salen/weather-slopes/snow-depth/ , https://apps.apple.com/se/app/skistar/id406481077?l=en-GB |
| PeakVisor | Map- and 3D-first mountain app | Lift status, season dates, slope counts per resort; weather from Apple WeatherKit; Japan ski coverage unconfirmed | PeakVisor PRO subscription (linked; price not read) | https://peakvisor.com/ski/norway/innlandet/fnugg-kvitfjell/live |

Not found: a Swedish national aggregator like Fnugg. A search for SLAO/Svenska Skidanläggningar found no snow-report service, so this is unconfirmed rather than absent. Swedish skiers seem to use OnTheSnow, Skiresort.info and the resort groups' own sites (https://www.skiresort.info/snow-reports/sweden/ , https://onthesnow.com/sweden/skireport).

### 3. Gaps by user job

Ratings: Imp = importance to the user, Feas = feasibility for this project, Size = S/M/L.

**Deciding where to go**

| Gap | Who has it | Imp | Feas | Size | Notes |
|---|---|---|---|---|---|
| Resort-reported depth next to (or instead of) the model's | SnowJapan, Skiresort, OnTheSnow, Fnugg, SkiStar | High | Blocked: SnowJapan has no reuse terms (permission ask pending); JMA stations cover only some resorts; Fnugg's terms probably exclude a "fnugg-like" service | L | Today's contrast: Skiresort has Happo-one at 160 cm top and 18 cm base; Foray says 102 cm. Ties to PROPOSALS "Data source accuracy". |
| New snow (24 h / 72 h) as its own figure | OnTheSnow (3-day), Snow-Forecast ("fresh snowfall", last snowfall date), OpenSnow (24 h), Fnugg | High | Feasible: Open-Meteo snowfall for past days, same provider | S-M | "Did it just dump" is the main powder signal. Model snowfall may be less biased than standing depth, but that is unconfirmed and worth checking against SnowJapan figures. |
| "Most snow coming" ranking or map | OnTheSnow (3-day forecast column), Snow-Forecast (9-day outlook, 3-day snow map), OpenSnow (15-day maps) | High | Feasible | M | Already PROPOSALS "Forecast" (a) and (b). |
| Filter by multi-resort pass (Ikon/Epic etc.) | OnTheSnow app | Low | Feasible, but hand-curated and drifts every season | S | Not worth the upkeep. |

**Deciding when to go (the next days)**

| Gap | Who has it | Imp | Feas | Size | Notes |
|---|---|---|---|---|---|
| Forecast at the resort's real altitude (top/mid/base) and freezing level | Snow-Forecast (top/mid/base plus "Freeze m") | High | Likely feasible: Open-Meteo's `elevation=` corrects temperature (owner research). A freezing-level variable and whether snowfall is re-split by altitude are unverified | S-M | Foray's Niseko forecast today reads "rain showers, high 10°" at a 134 m valley point, which is misleading for skiing. Ties to "Forecast" and "Data source accuracy". |
| Human forecaster commentary and confidence | OpenSnow Japan Daily Snow (paid), Mountainwatch Grasshopper (free, weekly) | Medium | Not feasible to produce; linking out is fine | S (link) | |
| Snow alerts | OnTheSnow, OpenSnow, Snow-Forecast | Medium | Conflicts with the constraints: needs accounts or a backend | L | Non-goal. |

**What it's like now**

| Gap | Who has it | Imp | Feas | Size | Notes |
|---|---|---|---|---|---|
| Open/closed status and opening dates | OnTheSnow (projected opening, e.g. Niseko Nov 28), Skiresort, Fnugg, PeakVisor, SkiStar | High in Nov/Dec and April | Blocked: resort-reported, no open source for Japan. Hand-curated season dates would need yearly upkeep for 477 resorts | L | Today Foray shows Niseko "7cm now" with nothing to say it opens Nov 28. |
| Lifts and runs open | Skiresort, OnTheSnow, Fnugg, SkiStar | High | Blocked, same reason | L | Link out instead. |
| Depth at top and at base | Skiresort, Snow-Forecast, Fnugg | Medium | Not with a single model point; the model doesn't vary depth by elevation | M | Comes with the reported-depth item if it's ever unblocked. |
| Webcams | SnowJapan, Snow-Forecast, Mountainwatch, SkiStar, Fnugg | Medium | Feasible only as per-resort curated links; high upkeep | M | Low priority. |

**Planning a trip**

| Gap | Who has it | Imp | Feas | Size | Notes |
|---|---|---|---|---|---|
| Any per-resort link out (resort site, piste map, a reports page) | Every comparison product | High | Feasible: OpenSkiMap area link; resort website from OpenSkiData's properties (if the field exists, unverified); a SnowJapan link (linking isn't scraping) | S | Today the detail card has no outbound link at all. |
| Lodging, passes, transport | Skiresort, SkiStar, SnowJapan directory | Medium | Conflicts: affiliate/commercial, and curation | L | Non-goal. |
| Shareable filtered view; Japanese-name search | — (common on others) | Medium | Feasible | S each | Already in the PROPOSALS backlog. |

**Trusting the numbers**

| Gap | Who has it | Imp | Feas | Size | Notes |
|---|---|---|---|---|---|
| Each figure labelled with its source | Skiresort (resort data), OpenSnow ("Estimated at…") | High | Feasible | S | Foray's banner explains the model, but list rows and Top 10 say "103cm now" with no "model" tag. |
| A measured reading next to the model | SkiStar (sensors), Fnugg, SnowJapan | High | Partly feasible: JMA stations near a subset of resorts; SMHI for Sweden; seNorge at build time for Norway | M | Ties to "Data source accuracy". |
| Real season history | SnowJapan archives, OnTheSnow history graph, Snow-Forecast SnowPro history | Medium | Feasible: the daily-snapshot Action (README "Next steps") builds it from this winter on | M | Ties to "Rethink the typical-season curves". |

### 4. Where Foray is ahead
- **Coverage and overview:** 477 Japanese resorts on one map, small ones included. Skiresort's Japan snow report lists 13 resorts; OnTheSnow and OpenSnow are lists, not maps.
- **Always has a number:** early in the season, OnTheSnow shows "n/a" for every closed resort (Niseko, Rusutsu, Furano today); Foray still shows a modelled depth and a 7-day forecast.
- **Free, no ads, no account, no tracking.** OnTheSnow's app tracks for advertising; Snow-Forecast puts its extras behind SnowPro; OpenSnow is $49.99+ a year.
- **Open data and an honest framing:** ODbL/CC BY data, and the illustrative Typical season is clearly labelled. OpenSnow's "Estimated" is the only comparable honesty label found.
- **Nordics:** Fnugg's terms exclude similar services, and SkiStar covers only its own six destinations. A single free map across all Swedish and Norwegian areas looks like an empty niche (unconfirmed, since no Swedish aggregator turned up).

### 5. Recommendations (in order)
1. **Forecast at the resort's real altitude in the detail card** (S-M). Pass the top (or mid) elevation to Open-Meteo, add a freezing-level line, and label it "at ~1,300 m". First verify that freezing level is available and how snowfall reacts to `elevation=`. Extends PROPOSALS "Forecast" and "Data source accuracy".
2. **Per-resort "More about this resort" links** (S). OpenSkiMap area, the resort website if OpenSkiData carries one, and a SnowJapan search or page link. This hands users off to resort-reported depth and lift status without needing permission to reuse anyone's data. New item (closest: "Data source accuracy").
3. **New snow, then "Most snow coming"** (M). Add past-24/72 h model snowfall to the row and the card, then build PROPOSALS "Forecast" (b) and, after it, (a).
4. **Source labels on every figure, plus a JMA-station pilot** (S, then M). Add "model" tags in rows and Top 10 now. Then show a nearest-station measured depth for a handful of resorts where a station sits at the resort (Nozawa-type cases). This is the "Data source accuracy" cheaper steps, plus its JMA option.
5. **Start the daily-snapshot Action this winter** (M). Every day without it is lost history. It feeds "Rethink the typical-season curves" and eases the live-refresh call budget.

**Deliberate non-goals:**
- Lift/run status and opening dates, by scraping or by hand: blocked data or heavy upkeep.
- Alerts, favourites synced across devices, trip accounts: needs a backend.
- Lodging, passes, affiliate links: commercial, against the hobby/non-commercial basis.
- Human forecast writing: needs a person; link out instead.
- Curated webcams and pass filters: upkeep outweighs the value.
- Any SnowJapan or Fnugg data feed before written permission. Fnugg's terms bar services that "correspond to fnugg.no", so Norway likely stays on Open-Meteo/seNorge.

### 6. Open questions for the owner
1. Ask SnowJapan and Fnugg for permission at the same time? Is Foray "a service corresponding to fnugg.no" in your view (Fnugg's terms)?
2. Are outbound links to commercial sites (resort sites, SnowJapan, Skiresort) fine for the project?
3. Altitude forecast: show the top, the mid-point, or let the user toggle between them?
4. Ship the Japan items (1-4) before the Nordic selector, while the Japan season runs? Or launch Sweden/Norway first, where the model is closest to measured snow?
5. Once real snapshot history exists, retire the illustrative Typical season, or keep it as a fallback for resorts without history?
