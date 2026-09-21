require 'json'

# Turns OpenSkiMap's ski_areas.geojson (https://openskidata.org) into resort
# entries for data/resorts.json. Pure computation, no I/O — scripts/
# import_openskimap.rb does the downloading and file writing, the same split
# as lib/season_curve.rb and scripts/build_data.rb.
module OpenSkiMapImport
  REGION_ORDER = ["Hokkaido", "Tohoku", "Kanto", "Niigata", "Nagano", "Chubu", "Western Japan"].freeze

  # The app's "regions" are a ski-oriented grouping, not the eight official
  # ones: Niigata and Nagano stay separate because they're the two big ski
  # prefectures the app already treated as regions.
  PREFECTURE_REGION = {
    "Hokkaido" => "Hokkaido",
    "Aomori" => "Tohoku", "Iwate" => "Tohoku", "Miyagi" => "Tohoku",
    "Akita" => "Tohoku", "Yamagata" => "Tohoku", "Fukushima" => "Tohoku",
    "Gunma" => "Kanto", "Tochigi" => "Kanto", "Ibaraki" => "Kanto",
    "Saitama" => "Kanto", "Chiba" => "Kanto", "Tokyo" => "Kanto", "Kanagawa" => "Kanto",
    "Niigata" => "Niigata",
    "Nagano" => "Nagano",
    "Toyama" => "Chubu", "Ishikawa" => "Chubu", "Fukui" => "Chubu", "Yamanashi" => "Chubu",
    "Gifu" => "Chubu", "Shizuoka" => "Chubu", "Aichi" => "Chubu",
  }.freeze
  DEFAULT_REGION = "Western Japan" # Kansai, Chugoku, Shikoku, Kyushu — a handful of small areas each

  MAJOR_MIN_KM = 20
  MEDIUM_MIN_KM = 8

  def self.region_for(prefecture)
    PREFECTURE_REGION.fetch(prefecture, DEFAULT_REGION)
  end

  def self.tier_for(run_km, curated: false)
    return "major" if curated || run_km >= MAJOR_MIN_KM
    run_km >= MEDIUM_MIN_KM ? "medium" : "small"
  end

  # OpenSkiMap's `name` is a comma-joined mix of Japanese and English names
  # ("ニセコユナイテッド, Niseko United"). Take the first purely-ASCII part
  # (after dropping parenthetical Japanese like "Ontake 2240 (長野県のスキー場)"),
  # falling back to the raw string when there's no English name at all.
  # Deliberately not smarter than that — see the naming to-do in
  # docs/PROPOSALS.md.
  def self.english_name(raw)
    parts = raw.to_s.split(/,\s*/).map { |p| ascii_fold(strip_parentheticals(p)).strip }
    parts.find { |p| !p.empty? && p.match?(/\A[\x20-\x7E]+\z/) } || raw.to_s.strip
  end

  # Repeats so nested pairs like "(五鹿山（ごかざん）スキー場)" go innermost-first.
  def self.strip_parentheticals(str)
    loop do
      stripped = str.gsub(/\s*[（(][^（()）]*[)）]/, "")
      return str if stripped == str
      str = stripped
    end
  end

  # Romanised Japanese carries macrons ("Kōgen"); plain ASCII is what the
  # rest of the app (slugs, search) can rely on.
  ASCII_FOLD = { "ā" => "a", "ī" => "i", "ū" => "u", "ē" => "e", "ō" => "o",
                 "Ā" => "A", "Ī" => "I", "Ū" => "U", "Ē" => "E", "Ō" => "O",
                 "ä" => "a", "é" => "e" }.freeze

  def self.ascii_fold(str)
    str.gsub(/[#{ASCII_FOLD.keys.join}]/) { |c| ASCII_FOLD[c] }
  end

  def self.slugify(str)
    str.downcase.gsub(/[^a-z0-9]+/, "_").gsub(/\A_+|_+\z/, "")
  end

  # Mean of every vertex — good enough to place a marker on a ski area.
  def self.centroid(geometry)
    pts = []
    walk = lambda do |c|
      if c[0].is_a?(Numeric)
        pts << c
      else
        c.each { |x| walk.call(x) }
      end
    end
    walk.call(geometry["coordinates"])
    return nil if pts.empty?
    [(pts.sum { |p| p[1] } / pts.length).round(4), (pts.sum { |p| p[0] } / pts.length).round(4)]
  end

  # One GeoJSON feature -> a flat hash, or nil when it isn't an operating,
  # named, downhill ski area in Japan.
  def self.summarize(feature)
    props = feature["properties"] || {}
    return nil unless props["status"] == "operating"
    return nil unless (props["activities"] || []).include?("downhill")
    raw_name = props["name"].to_s.strip
    return nil if raw_name.empty?

    place = (props["places"] || []).find { |p| p["iso3166_1Alpha2"] == "JP" }
    return nil unless place
    prefecture = place.dig("localized", "en", "region").to_s.sub(/ (Prefecture|Metropolis)\z/, "")

    lat_lon = centroid(feature["geometry"])
    return nil unless lat_lon

    stats = props["statistics"] || {}
    runs = stats["runs"] || {}
    lifts = stats["lifts"] || {}
    by_difficulty = runs.dig("byActivity", "downhill", "byDifficulty") || {}
    run_km = by_difficulty.values.sum { |d| d["lengthInKm"] || 0 }
    lift_count = (lifts["byType"] || {}).values.sum { |d| d["count"] || 0 }
    top = runs["maxElevation"] || lifts["maxElevation"]

    {
      "osm_id" => props["id"],
      "raw_name" => raw_name,
      "name" => english_name(raw_name),
      "prefecture" => prefecture,
      "lat" => lat_lon[0],
      "lon" => lat_lon[1],
      "elevation_top_m" => top && top.round,
      "run_km" => run_km.round(1),
      "lift_count" => lift_count,
    }
  end

  def self.summarize_all(geojson)
    geojson.fetch("features").map { |f| summarize(f) }.compact
  end

  # Folds `areas` (from summarize_all) into the existing resort list.
  #
  # matchers: { curated_resort_id => Regexp } — OpenSkiMap areas whose raw
  # name matches belong to that curated resort (Shiga Kogen alone is ~15
  # sub-areas there). Proximity isn't used: the hand-placed curated
  # coordinates sit 1-6 km from OpenSkiMap's, and a nearest-neighbour match
  # picks the wrong resort in crowded valleys (Appi's nearest neighbour is a
  # different resort).
  #
  # Curated entries keep their own name/coordinates and only gain metadata
  # (prefecture, tier, run_km, lift_count, osm_ids). Everything else becomes a
  # new entry. Re-running is safe: areas already recorded on an existing entry
  # are skipped, and existing entries are never rewritten, so hand edits
  # (a cleaned-up name, say) survive.
  def self.merge(existing, areas, matchers)
    known_ids = {}
    existing.each do |r|
      ([r["osm_id"]] + (r["osm_ids"] || [])).compact.each { |id| known_ids[id] = true }
    end

    absorbed = {}
    merged = existing.map do |r|
      matcher = matchers[r["id"]]
      next r unless matcher
      mine = areas.select { |a| !absorbed[a["osm_id"]] && a["raw_name"].match?(matcher) }
      mine.each { |a| absorbed[a["osm_id"]] = true }
      enrich_curated(r, mine)
    end

    used_ids = {}
    merged.each { |r| used_ids[r["id"]] = true }

    added = areas.reject { |a| absorbed[a["osm_id"]] || known_ids[a["osm_id"]] }
                 .sort_by { |a| [-a["run_km"], a["name"]] }
                 .map do |a|
      id = unique_id(a, used_ids)
      used_ids[id] = true
      new_entry(a, id)
    end

    merged + added
  end

  def self.enrich_curated(resort, matched)
    return resort if matched.empty?
    prefecture = matched.max_by { |a| a["run_km"] }["prefecture"]
    out = {}
    resort.each do |k, v|
      out[k] = v
      out["prefecture"] = resort["prefecture"] || prefecture if k == "region"
    end
    out["tier"] = "major"
    out["run_km"] = matched.sum { |a| a["run_km"] }.round(1)
    out["lift_count"] = matched.sum { |a| a["lift_count"] }
    out["osm_ids"] = matched.map { |a| a["osm_id"] }.sort
    out
  end

  def self.new_entry(area, id)
    {
      "id" => id,
      "name" => area["name"],
      "region" => region_for(area["prefecture"]),
      "prefecture" => area["prefecture"],
      "lat" => area["lat"],
      "lon" => area["lon"],
      "elevation_top_m" => area["elevation_top_m"],
      "tier" => tier_for(area["run_km"]),
      "run_km" => area["run_km"],
      "lift_count" => area["lift_count"],
      "osm_id" => area["osm_id"],
    }
  end

  # Readable slug of the English name; on a collision, qualified by
  # prefecture and then by a slice of the OpenSkiMap id. Japanese-only names
  # have no slug at all, so they get an id from the OpenSkiMap id.
  def self.unique_id(area, used_ids)
    base = slugify(area["name"])
    return "osm_#{area['osm_id'][0, 8]}" if base.empty?
    [base, "#{base}_#{slugify(area['prefecture'])}", "#{base}_#{area['osm_id'][0, 6]}"].each do |candidate|
      return candidate unless used_ids[candidate]
    end
    "osm_#{area['osm_id'][0, 8]}"
  end
end
