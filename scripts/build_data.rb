require 'json'
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
template = File.read(File.join(ROOT, "template.html"))
File.write(File.join(ROOT, "index.html"), template.sub("__SKI_DATA_JSON__") { json_str })
STDERR.puts "Wrote index.html"
