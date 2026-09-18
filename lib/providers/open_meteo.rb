require 'net/http'
require 'uri'
require 'json'

module Providers
  # Fetches current snow depth and temperature for a batch of resorts from
  # Open-Meteo. Isolated here — rather than interleaved into build_data.rb —
  # so the one part of the pipeline that can fail over the network (and the
  # one part a test would want to stub) sits by itself. Not yet a swappable
  # "pick a provider" interface (that's proposed separately, see
  # docs/PROPOSALS.md §2); this just gives that future interface a shape to
  # implement.
  class OpenMeteo
    ENDPOINT = "https://api.open-meteo.com/v1/forecast"

    # resorts: [{ "lat" => Float, "lon" => Float }, ...]
    # returns: { "fetched_at" => String, "conditions" => [{ "snow_depth_cm" =>,
    #            "temperature_c" =>, "weather_code" => }, ...] }, conditions
    #            in the same order as resorts.
    def fetch(resorts)
      lats = resorts.map { |r| r["lat"] }.join(",")
      lons = resorts.map { |r| r["lon"] }.join(",")
      url = URI("#{ENDPOINT}?latitude=#{lats}&longitude=#{lons}" \
                "&current=snow_depth,temperature_2m,weather_code&timezone=Asia%2FTokyo")
      raw = JSON.parse(Net::HTTP.get(url))

      unless raw.is_a?(Array) && raw.length == resorts.length
        got = raw.is_a?(Array) ? raw.length : raw.inspect
        raise "Open-Meteo response shape mismatch: expected #{resorts.length} entries, got #{got}"
      end

      fetched_at = nil
      conditions = raw.map do |entry|
        cur = entry.fetch("current")
        fetched_at = cur["time"]
        {
          "snow_depth_cm" => (cur["snow_depth"] * 100).round(1),
          "temperature_c" => cur["temperature_2m"],
          "weather_code" => cur["weather_code"],
        }
      end

      { "fetched_at" => fetched_at, "conditions" => conditions }
    end
  end
end
