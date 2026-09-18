require 'json'
require 'digest'
require_relative '../lib/season_curve'
require_relative '../lib/providers/open_meteo'

ROOT = File.expand_path("..", __dir__)
DATA_DIR = File.join(ROOT, "data")

resorts = JSON.parse(File.read(File.join(DATA_DIR, "resorts.json")))

live = Providers::OpenMeteo.new.fetch(resorts)
resorts.each_with_index { |r, i| r.merge!(live.fetch("conditions")[i]) }

STDERR.puts "Sample: #{resorts[0]}"
STDERR.puts "Fetched at: #{live['fetched_at']}"

resorts.each do |r|
  depth_curve, temp_curve = SeasonCurve.generate(
    peak_cm: r["typical_peak_cm"], min_c: r["typical_min_c"], edge_c: r["typical_edge_c"]
  )
  r["typical_season_cm"] = depth_curve
  r["typical_season_temp_c"] = temp_curve
end

out = {
  "generated_at" => live["fetched_at"],
  "generated_note" => "Live snow depth/temperature fetched from Open-Meteo (api.open-meteo.com) at build time. Typical-season curves are illustrative seasonal patterns based on each resort's known typical peak base depth, not measured historical data.",
  "resorts" => resorts,
}
json_str = JSON.generate(out)

File.write(File.join(DATA_DIR, "ski_data.json"), json_str)
STDERR.puts "Wrote data/ski_data.json, bytes=#{json_str.length}"

# splice the fresh data into index.html from the template
template = File.read(File.join(ROOT, "template.html"), encoding: "UTF-8")
html = template.sub("__SKI_DATA_JSON__") { json_str }

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
