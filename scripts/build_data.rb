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

geo = JSON.parse(File.read(File.join(DATA_DIR, "japan_boundary.geojson")))
feature = geo["features"][0]
polys = feature["geometry"]["coordinates"] # MultiPolygon

all_lons = []
all_lats = []
polys.each { |poly| poly.each { |ring| ring.each { |pt| all_lons << pt[0]; all_lats << pt[1] } } }
resorts.each { |r| all_lons << r["lon"]; all_lats << r["lat"] }

lon_min, lon_max = all_lons.min, all_lons.max
lat_min, lat_max = all_lats.min, all_lats.max
mean_lat_rad = ((lat_min + lat_max) / 2.0) * Math::PI / 180.0
cos_corr = Math.cos(mean_lat_rad)

pad = 30
view_w = 620
view_h = 760

proj_lon_min = lon_min * cos_corr
proj_lon_max = lon_max * cos_corr
span_x = proj_lon_max - proj_lon_min
span_y = lat_max - lat_min

scale = [(view_w - 2*pad) / span_x, (view_h - 2*pad) / span_y].min

project = lambda do |lon, lat|
  x = (lon * cos_corr - proj_lon_min) * scale + pad
  y = (lat_max - lat) * scale + pad
  [x, y]
end

def ring_to_path(ring, project)
  pts = ring.map { |lon, lat| project.call(lon, lat) }
  "M " + pts.map { |x, y| "%.1f,%.1f" % [x, y] }.join(" L ") + " Z"
end

path_parts = []
polys.each do |poly|
  poly.each do |ring|
    path_parts << ring_to_path(ring, project)
  end
end
japan_path = path_parts.join(" ")

xs = []; ys = []
all_lons.each_with_index do |lon, i|
  x, y = project.call(lon, all_lats[i])
  xs << x; ys << y
end
min_x, max_x = xs.min - 10, xs.max + 10
min_y, max_y = ys.min - 10, ys.max + 10
view_box = "%.1f %.1f %.1f %.1f" % [min_x, min_y, (max_x-min_x), (max_y-min_y)]

resorts.each do |r|
  x, y = project.call(r["lon"], r["lat"])
  r["x"] = x.round(1)
  r["y"] = y.round(1)
end

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
  "japan_path" => japan_path,
  "view_box" => view_box,
  "resorts" => resorts,
}
json_str = JSON.generate(out)

File.write(File.join(DATA_DIR, "ski_data.json"), json_str)
STDERR.puts "Wrote data/ski_data.json, view_box=#{view_box}, bytes=#{json_str.length}"

# splice the fresh data into index.html from the template
template = File.read(File.join(ROOT, "template.html"))
File.write(File.join(ROOT, "index.html"), template.sub("__SKI_DATA_JSON__") { json_str })
STDERR.puts "Wrote index.html"
