require_relative '../test_helper'
require 'providers/open_meteo'
require 'json'

class OpenMeteoProviderTest < Minitest::Test
  RESORTS = [
    { "lat" => 42.8048, "lon" => 140.6874 },
    { "lat" => 36.9214, "lon" => 138.4386 },
  ].freeze

  def canned_response(entries)
    JSON.generate(entries)
  end

  def test_fetch_returns_conditions_in_the_same_order_as_resorts
    body = canned_response([
      { "current" => { "time" => "2026-02-14T12:00", "snow_depth" => 1.5, "temperature_2m" => -8.3, "weather_code" => 3 } },
      { "current" => { "time" => "2026-02-14T12:00", "snow_depth" => 0.6, "temperature_2m" => -2.1, "weather_code" => 1 } },
    ])

    result = Net::HTTP.stub(:get, body) { Providers::OpenMeteo.new.fetch(RESORTS) }

    assert_equal "2026-02-14T12:00", result["fetched_at"]
    assert_equal(
      [
        { "snow_depth_cm" => 150.0, "temperature_c" => -8.3, "weather_code" => 3 },
        { "snow_depth_cm" => 60.0, "temperature_c" => -2.1, "weather_code" => 1 },
      ],
      result["conditions"]
    )
  end

  def test_fetch_converts_meters_to_centimeters_and_rounds
    body = canned_response([
      { "current" => { "time" => "2026-02-14T12:00", "snow_depth" => 0.0, "temperature_2m" => 9.6, "weather_code" => 0 } },
      { "current" => { "time" => "2026-02-14T12:00", "snow_depth" => 1.234, "temperature_2m" => -0.05, "weather_code" => 2 } },
    ])

    result = Net::HTTP.stub(:get, body) { Providers::OpenMeteo.new.fetch(RESORTS) }

    assert_equal 0.0, result["conditions"][0]["snow_depth_cm"]
    assert_equal 123.4, result["conditions"][1]["snow_depth_cm"]
  end

  def test_fetch_raises_on_a_response_shorter_than_the_resort_list
    body = canned_response([
      { "current" => { "time" => "2026-02-14T12:00", "snow_depth" => 0.0, "temperature_2m" => 1.0, "weather_code" => 0 } },
    ])

    error = assert_raises(RuntimeError) do
      Net::HTTP.stub(:get, body) { Providers::OpenMeteo.new.fetch(RESORTS) }
    end
    assert_match(/mismatch/i, error.message)
  end

  def test_fetch_raises_on_a_non_array_response
    body = JSON.generate({ "error" => true, "reason" => "Invalid latitude" })

    error = assert_raises(RuntimeError) do
      Net::HTTP.stub(:get, body) { Providers::OpenMeteo.new.fetch(RESORTS) }
    end
    assert_match(/mismatch/i, error.message)
  end
end
