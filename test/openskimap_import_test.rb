require_relative 'test_helper'
require 'openskimap_import'

class OpenSkiMapImportTest < Minitest::Test
  def feature(id:, name:, prefecture: "Nagano Prefecture", status: "operating", activities: ["downhill"],
              geometry: { "type" => "Point", "coordinates" => [138.0, 36.0] }, run_km: nil, top: nil, lifts: 0)
    stats = {}
    if run_km
      stats["runs"] = {
        "byActivity" => { "downhill" => { "byDifficulty" => { "easy" => { "count" => 1, "lengthInKm" => run_km } } } },
        "maxElevation" => top,
      }
    end
    stats["lifts"] = { "byType" => { "gondola" => { "count" => lifts } } } if lifts > 0
    {
      "geometry" => geometry,
      "properties" => {
        "id" => id, "name" => name, "status" => status, "activities" => activities,
        "places" => [{ "iso3166_1Alpha2" => "JP", "localized" => { "en" => { "region" => prefecture } } }],
        "statistics" => stats,
      },
    }
  end

  def area(id, name, km, prefecture: "Nagano", lifts: 2)
    { "osm_id" => id, "raw_name" => name, "name" => OpenSkiMapImport.english_name(name),
      "prefecture" => prefecture, "lat" => 36.0, "lon" => 138.0, "elevation_top_m" => 1500,
      "run_km" => km, "lift_count" => lifts }
  end

  # ---- names / ids ----

  def test_english_name_takes_the_first_pure_ascii_part
    assert_equal "Niseko United", OpenSkiMapImport.english_name("ニセコユナイテッド, Niseko United")
    assert_equal "Zao Onsen Ski Resort", OpenSkiMapImport.english_name("蔵王温泉スキー場, Zao Onsen Ski Resort")
  end

  def test_english_name_drops_parenthetical_japanese_including_nested_pairs
    assert_equal "Ontake 2240", OpenSkiMapImport.english_name("Ontake 2240 (長野県のスキー場)")
    assert_equal "Kamiyubetsu Town Gokazan", OpenSkiMapImport.english_name("Kamiyūbetsu Town Gokazan (五鹿山（ごかざん）スキー場)")
  end

  def test_english_name_folds_macrons_to_plain_ascii
    assert_equal "Yachiho Kogen Ski Resort", OpenSkiMapImport.english_name("八千穂高原スキー場, Yachiho Kōgen Ski Resort")
  end

  def test_english_name_falls_back_to_the_raw_name_when_there_is_no_english_part
    assert_equal "グランドサンピア猪苗代リゾートスキー場", OpenSkiMapImport.english_name("グランドサンピア猪苗代リゾートスキー場")
  end

  def test_slugify
    assert_equal "hakuba_happo_one", OpenSkiMapImport.slugify("Hakuba Happo-One")
    assert_equal "", OpenSkiMapImport.slugify("スキー場")
  end

  # ---- geometry / summarize ----

  def test_centroid_of_a_point_is_the_point_as_lat_lon
    assert_equal [36.5, 137.25], OpenSkiMapImport.centroid({ "type" => "Point", "coordinates" => [137.25, 36.5] })
  end

  def test_centroid_of_a_polygon_averages_its_vertices
    ring = [[137.0, 36.0], [139.0, 36.0], [139.0, 38.0], [137.0, 38.0]]
    assert_equal [37.0, 138.0], OpenSkiMapImport.centroid({ "type" => "Polygon", "coordinates" => [ring] })
  end

  def test_summarize_pulls_stats_and_strips_the_prefecture_suffix
    f = feature(id: "abc", name: "フー, Foo Ski Area", run_km: 12.34, top: 1499.6, lifts: 3, prefecture: "Hokkaido Prefecture")
    s = OpenSkiMapImport.summarize(f)
    assert_equal "Foo Ski Area", s["name"]
    assert_equal "Hokkaido", s["prefecture"]
    assert_equal 12.3, s["run_km"]
    assert_equal 3, s["lift_count"]
    assert_equal 1500, s["elevation_top_m"]
  end

  def test_summarize_tolerates_an_area_with_no_statistics
    s = OpenSkiMapImport.summarize(feature(id: "abc", name: "Bare Hill"))
    assert_equal 0, s["run_km"]
    assert_equal 0, s["lift_count"]
    assert_nil s["elevation_top_m"]
  end

  def test_summarize_skips_closed_nordic_only_unnamed_and_non_japanese_areas
    assert_nil OpenSkiMapImport.summarize(feature(id: "a", name: "X", status: "abandoned"))
    assert_nil OpenSkiMapImport.summarize(feature(id: "b", name: "X", activities: ["nordic"]))
    assert_nil OpenSkiMapImport.summarize(feature(id: "c", name: "  "))
    foreign = feature(id: "d", name: "X")
    foreign["properties"]["places"][0]["iso3166_1Alpha2"] = "FR"
    assert_nil OpenSkiMapImport.summarize(foreign)
  end

  # ---- regions / tiers ----

  def test_region_for_groups_prefectures_and_defaults_to_western_japan
    assert_equal "Tohoku", OpenSkiMapImport.region_for("Yamagata")
    assert_equal "Kanto", OpenSkiMapImport.region_for("Gunma")
    assert_equal "Chubu", OpenSkiMapImport.region_for("Gifu")
    assert_equal "Nagano", OpenSkiMapImport.region_for("Nagano")
    assert_equal "Western Japan", OpenSkiMapImport.region_for("Hyogo")
    assert_equal "Western Japan", OpenSkiMapImport.region_for("Kumamoto")
  end

  def test_every_region_the_importer_can_produce_is_in_region_order
    produced = OpenSkiMapImport::PREFECTURE_REGION.values + [OpenSkiMapImport::DEFAULT_REGION]
    assert_empty produced.uniq - OpenSkiMapImport::REGION_ORDER
  end

  def test_tier_thresholds
    assert_equal "major", OpenSkiMapImport.tier_for(20)
    assert_equal "medium", OpenSkiMapImport.tier_for(19.9)
    assert_equal "medium", OpenSkiMapImport.tier_for(8)
    assert_equal "small", OpenSkiMapImport.tier_for(7.9)
    assert_equal "major", OpenSkiMapImport.tier_for(0.5, curated: true)
  end

  # ---- merge ----

  def existing
    [{ "id" => "shiga", "name" => "Shiga Kogen", "region" => "Nagano", "lat" => 36.7, "lon" => 138.5, "elevation_top_m" => 2307 },
     { "id" => "niseko", "name" => "Niseko United", "region" => "Hokkaido", "lat" => 42.8, "lon" => 140.7, "elevation_top_m" => 1308 }]
  end

  MATCHERS = { "shiga" => /shiga kogen/i, "niseko" => /niseko united/i }.freeze

  def test_merge_folds_matching_areas_into_the_curated_resort_and_keeps_its_own_fields
    areas = [area("s1", "Shiga Kogen Giant", 2.4), area("s2", "Shiga Kogen Yakebitaiyama", 16.5), area("n1", "Niseko United", 58.8, prefecture: "Hokkaido")]
    merged = OpenSkiMapImport.merge(existing, areas, MATCHERS)

    shiga = merged.find { |r| r["id"] == "shiga" }
    assert_equal 36.7, shiga["lat"]
    assert_equal 2307, shiga["elevation_top_m"]
    assert_equal "major", shiga["tier"]
    assert_in_delta 18.9, shiga["run_km"], 0.001
    assert_equal 4, shiga["lift_count"]
    assert_equal %w[s1 s2], shiga["osm_ids"]
    assert_equal "Nagano", shiga["prefecture"]
    assert_equal 2, merged.length, "matched areas must not also be added as new resorts"
  end

  def test_merge_adds_unmatched_areas_as_new_entries_largest_first
    areas = [area("a", "Small Hill", 1.0), area("b", "Big Mountain", 25.0, prefecture: "Gifu"), area("c", "Mid Slope", 10.0)]
    added = OpenSkiMapImport.merge(existing, areas, MATCHERS).drop(2)

    assert_equal %w[Big\ Mountain Mid\ Slope Small\ Hill], added.map { |r| r["name"] }
    assert_equal %w[major medium small], added.map { |r| r["tier"] }
    assert_equal "Chubu", added[0]["region"]
    assert_equal "Gifu", added[0]["prefecture"]
    assert_equal "b", added[0]["osm_id"]
  end

  def test_merge_is_idempotent
    areas = [area("s1", "Shiga Kogen Giant", 2.4), area("a", "Small Hill", 1.0)]
    once = OpenSkiMapImport.merge(existing, areas, MATCHERS)
    twice = OpenSkiMapImport.merge(once, areas, MATCHERS)
    assert_equal once, twice
  end

  def test_merge_does_not_overwrite_a_hand_edited_name_on_rerun
    areas = [area("a", "Small Hill", 1.0)]
    once = OpenSkiMapImport.merge(existing, areas, MATCHERS)
    once.last["name"] = "Small Hill (renamed by hand)"
    twice = OpenSkiMapImport.merge(once, areas, MATCHERS)
    assert_equal "Small Hill (renamed by hand)", twice.last["name"]
    assert_equal once.length, twice.length
  end

  def test_merge_gives_colliding_names_distinct_ids
    areas = [area("aaaaaa11", "Manza Onsen", 3.0, prefecture: "Gunma"), area("bbbbbb22", "Manza Onsen", 2.0, prefecture: "Nagano"),
             area("cccccc33", "Manza Onsen", 1.0, prefecture: "Nagano")]
    ids = OpenSkiMapImport.merge(existing, areas, MATCHERS).drop(2).map { |r| r["id"] }
    assert_equal ids.uniq, ids
    assert_equal "manza_onsen", ids[0]
  end

  def test_merge_gives_japanese_only_names_an_id_derived_from_the_osm_id
    areas = [area("deadbeef0123", "スキー場", 1.0)]
    assert_equal "osm_deadbeef", OpenSkiMapImport.merge(existing, areas, MATCHERS).last["id"]
  end
end
