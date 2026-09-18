require_relative '../test_helper'
require 'providers/fixture'
require 'json'
require 'tmpdir'

class FixtureProviderTest < Minitest::Test
  def write_snapshot(dir, data)
    path = File.join(dir, "conditions.json")
    File.write(path, JSON.generate(data))
    path
  end

  def test_fetch_returns_conditions_by_id_in_resort_order
    Dir.mktmpdir do |dir|
      path = write_snapshot(dir, {
        "fetched_at" => "2026-01-01T00:00",
        "conditions" => {
          "b" => { "snow_depth_cm" => 20.0, "temperature_c" => -2.0, "weather_code" => 1 },
          "a" => { "snow_depth_cm" => 10.0, "temperature_c" => -5.0, "weather_code" => 2 },
        },
      })

      result = Providers::Fixture.new(path: path).fetch([{ "id" => "a" }, { "id" => "b" }])

      assert_equal "2026-01-01T00:00", result["fetched_at"]
      assert_equal(
        [
          { "snow_depth_cm" => 10.0, "temperature_c" => -5.0, "weather_code" => 2 },
          { "snow_depth_cm" => 20.0, "temperature_c" => -2.0, "weather_code" => 1 },
        ],
        result["conditions"]
      )
    end
  end

  def test_fetch_raises_a_clear_error_for_a_resort_missing_from_the_snapshot
    Dir.mktmpdir do |dir|
      path = write_snapshot(dir, { "fetched_at" => "2026-01-01T00:00", "conditions" => {} })

      error = assert_raises(RuntimeError) do
        Providers::Fixture.new(path: path).fetch([{ "id" => "niseko" }])
      end
      assert_match(/niseko/, error.message)
    end
  end

  def test_default_path_points_at_the_real_fixture_and_covers_every_current_resort
    resorts = JSON.parse(File.read(File.expand_path("../../data/resorts.json", __dir__)))
    result = Providers::Fixture.new.fetch(resorts)
    assert_equal resorts.length, result["conditions"].length
  end
end
