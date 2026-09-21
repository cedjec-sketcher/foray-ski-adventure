require 'json'
require 'date'
require 'digest'
require_relative '../lib/season_curve'
require_relative '../lib/providers'

ROOT = File.expand_path("..", __dir__)
DATA_DIR = File.join(ROOT, "data")
CONFIG_DIR = File.join(ROOT, "config")

resorts = JSON.parse(File.read(File.join(DATA_DIR, "resorts.json")))

# Curve-tuning knobs (typical_peak_cm/min_c/edge_c) live separately from
# resort facts (name, region, coordinates) — once a resort has real
# historical data, it stops needing an entry here without resorts.json
# itself changing shape. Merge them in by id for the rest of this script.
#
# A resort with no entry simply has no typical-season curve: the page shows
# it in Live mode only. Only the larger resorts have entries.
tuning = JSON.parse(File.read(File.join(DATA_DIR, "illustrative_curve_tuning.json")))
orphans = tuning.keys - resorts.map { |r| r["id"] }
raise "Tuning entries for unknown resort id(s): #{orphans.join(', ')}" unless orphans.empty?

resorts.each do |r|
  knobs = tuning[r["id"]]
  next unless knobs
  r["typical_peak_cm"] = knobs.fetch("peak_cm")
  r["typical_min_c"] = knobs.fetch("min_c")
  r["typical_edge_c"] = knobs.fetch("edge_c")
end

# SNOWPACK_PROVIDER=fixture ruby scripts/build_data.rb runs entirely offline,
# using a captured snapshot instead of a live Open-Meteo request.
live = Providers.resolve.fetch(resorts)
resorts.each_with_index { |r, i| r.merge!(live.fetch("conditions")[i]) }

STDERR.puts "Sample: #{resorts[0]}"
STDERR.puts "Fetched at: #{live['fetched_at']}"

season_config = JSON.parse(File.read(File.join(CONFIG_DIR, "season.json")))
season_start = Date.parse(season_config.fetch("season_start"))
season_end = Date.parse(season_config.fetch("season_end"))
peak_date = Date.parse(season_config.fetch("peak_date"))
bell_width = season_config.fetch("bell_width")
step_days = season_config.fetch("step_days")

resorts.each do |r|
  next unless r["typical_peak_cm"]
  depth_curve, temp_curve = SeasonCurve.generate(
    peak_cm: r["typical_peak_cm"], min_c: r["typical_min_c"], edge_c: r["typical_edge_c"],
    season_start: season_start, season_end: season_end, peak_date: peak_date,
    bell_width: bell_width, step_days: step_days
  )
  r["typical_season_cm"] = depth_curve
  r["typical_season_temp_c"] = temp_curve
end

# Importer bookkeeping (data/resorts.json keeps it so re-imports stay
# idempotent) isn't something the page needs, and across ~500 resorts it adds up.
resorts.each { |r| %w[osm_id osm_ids lift_count].each { |k| r.delete(k) } }

out = {
  "generated_at" => live["fetched_at"],
  # Travels with the data if someone copies ski_data.json out of the repo;
  # see DATA_LICENSE.md.
  "data_license" => "Resort names, locations, elevations and run lengths: ODbL 1.0, from OpenSkiData / OpenSkiMap.org, (c) OpenStreetMap contributors, Skimap.org, Who's On First, (c) Mapterhorn. Snow depth, temperature and weather code: CC BY 4.0, Open-Meteo.com. See DATA_LICENSE.md in the project repository.",
  "generated_note" => "Live snow depth/temperature fetched from Open-Meteo (api.open-meteo.com) at build time. Typical-season curves are illustrative seasonal patterns based on each resort's known typical peak base depth, not measured historical data.",
  "resorts" => resorts,
}
json_str = JSON.generate(out)

File.write(File.join(DATA_DIR, "ski_data.json"), json_str)
STDERR.puts "Wrote data/ski_data.json, bytes=#{json_str.length}"

# splice the fresh data into index.html from the template
template = File.read(File.join(ROOT, "template.html"), encoding: "UTF-8")
# Resort names come from a third-party dataset (OpenSkiMap) and this JSON sits
# inside a <script> element, where a "</script>" in a name would end it early.
# The JSON escape \u003c means "<" to any JSON parser, so write every one that way.
html = template.sub("__SKI_DATA_JSON__") { json_str.gsub("<") { "\\u003c" } }

# Cache-bust assets/app.js and assets/styles.css with a hash of their own
# content, so a real change always reaches browsers immediately instead of
# waiting out GitHub Pages' 10-minute cache-control: max-age on those files
# (confirmed the hard way: this exact caching delay was mistaken for the
# tooltip fix not having landed, when it just hadn't propagated yet). An
# unchanged asset keeps the same hash, so this doesn't force a refetch of
# files that didn't actually change.
%w[app.js styles.css].each do |asset|
  path = File.join(ROOT, "assets", asset)
  hash = Digest::MD5.hexdigest(File.read(path, encoding: "UTF-8"))[0, 8]
  html = html.sub("assets/#{asset}\"", "assets/#{asset}?v=#{hash}\"")
end

File.write(File.join(ROOT, "index.html"), html)
STDERR.puts "Wrote index.html"
