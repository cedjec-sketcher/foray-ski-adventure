require 'json'
require 'net/http'
require 'uri'
require 'date'

ROOT = File.expand_path("..", __dir__)
DATA_DIR = File.join(ROOT, "data")

resorts = JSON.parse(File.read(File.join(DATA_DIR, "resorts.json")))

lats = resorts.map { |r| r["lat"] }.join(",")
lons = resorts.map { |r| r["lon"] }.join(",")
url = URI("https://api.open-meteo.com/v1/forecast?latitude=#{lats}&longitude=#{lons}&current=snow_depth,temperature_2m,weather_code&timezone=Asia%2FTokyo")
live = JSON.parse(Net::HTTP.get(url))

raise "mismatch #{live.length} vs #{resorts.length}" unless live.length == resorts.length

fetched_at = nil
resorts.each_with_index do |r, i|
  cur = live[i]["current"]
  r["snow_depth_cm"] = (cur["snow_depth"] * 100).round(1)
  r["temperature_c"] = cur["temperature_2m"]
  r["weather_code"] = cur["weather_code"]
  fetched_at = cur["time"]
end

STDERR.puts "Sample: #{resorts[0]}"
STDERR.puts "Fetched at: #{fetched_at}"

season_start = Date.new(2025, 12, 1)
season_end = Date.new(2026, 4, 30)
peak_date = Date.new(2026, 2, 14)
total_days = (season_end - season_start).to_i
peak_offset = (peak_date - season_start).to_i

def bell(day_offset, peak_offset, width = 45)
  Math.exp(-((day_offset - peak_offset) ** 2) / (2.0 * width ** 2))
end

resorts.each do |r|
  curve = []
  temp_curve = []
  d = 0
  while d <= total_days
    day = season_start + d
    val = bell(d, peak_offset) * r["typical_peak_cm"]
    curve << [day.iso8601, [val, 0].max.round(1)]
    # temperature: mild at season edges, coldest at the same mid-Feb trough as peak snow
    x = (d - peak_offset) / peak_offset.to_f
    x = [[x, -1.0].max, 1.0].min
    t = r["typical_min_c"] + (r["typical_edge_c"] - r["typical_min_c"]) * (x ** 2)
    temp_curve << [day.iso8601, t.round(1)]
    d += 3
  end
  r["typical_season_cm"] = curve
  r["typical_season_temp_c"] = temp_curve
end

out = {
  "generated_at" => fetched_at,
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
