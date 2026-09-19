require_relative 'test_helper'
require 'json'
require 'openskimap_import'

# The region list lives in three places that have to agree: the Ruby importer
# (which assigns regions), assets/app.js (which orders and colours them) and
# assets/styles.css (which defines the colour tokens). A region missing from
# app.js would silently get no list rows at all, so check them against each
# other and against the real data.
class RegionConsistencyTest < Minitest::Test
  ROOT = File.expand_path("..", __dir__)
  APP_JS = File.read(File.join(ROOT, "assets", "app.js"), encoding: "UTF-8")
  CSS = File.read(File.join(ROOT, "assets", "styles.css"), encoding: "UTF-8")
  RESORTS = JSON.parse(File.read(File.join(ROOT, "data", "resorts.json"), encoding: "UTF-8"))

  def js_region_order
    APP_JS[/var REGION_ORDER = \[(.*?)\];/m, 1].scan(/"([^"]+)"/).flatten
  end

  def js_region_vars
    body = APP_JS[/var REGION_VAR = \{(.*?)\};/m, 1]
    body.scan(/(?:"([^"]+)"|([A-Za-z]+))\s*:\s*"(--[a-z]+)"/).map { |quoted, bare, var| [quoted || bare, var] }.to_h
  end

  def test_app_js_and_the_importer_agree_on_the_region_list
    assert_equal OpenSkiMapImport::REGION_ORDER, js_region_order
  end

  def test_every_region_has_a_colour_token_defined_in_the_stylesheet
    vars = js_region_vars
    assert_equal js_region_order.sort, vars.keys.sort
    vars.each do |region, var|
      assert_includes CSS, "#{var}:", "#{region} maps to #{var}, which styles.css never defines"
    end
  end

  def test_every_resort_has_a_known_region_and_tier
    RESORTS.each do |r|
      assert_includes js_region_order, r["region"], "#{r['id']} has region #{r['region'].inspect}, which app.js doesn't know"
      assert_includes %w[major medium small], r["tier"], "#{r['id']} has tier #{r['tier'].inspect}"
    end
  end

  def test_resort_ids_are_unique_and_coordinates_are_in_japan
    ids = RESORTS.map { |r| r["id"] }
    assert_equal ids.uniq, ids
    RESORTS.each do |r|
      assert_kind_of Numeric, r["lat"]
      assert_kind_of Numeric, r["lon"]
      assert r["lat"].between?(24, 46), "#{r['id']} latitude #{r['lat']} is outside Japan"
      assert r["lon"].between?(122, 146), "#{r['id']} longitude #{r['lon']} is outside Japan"
    end
  end

  def test_every_curated_major_has_typical_season_tuning_and_no_live_only_major_lacks_it_silently
    tuning = JSON.parse(File.read(File.join(ROOT, "data", "illustrative_curve_tuning.json")))
    majors = RESORTS.select { |r| r["tier"] == "major" }.map { |r| r["id"] }
    assert_empty majors - tuning.keys, "major resorts with no typical-season tuning (they'd be live-only)"
  end
end
