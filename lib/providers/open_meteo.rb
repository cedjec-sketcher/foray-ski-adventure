require 'net/http'
require 'uri'
require 'json'

module Providers
  # Fetches current snow depth and temperature for a batch of resorts from
  # Open-Meteo. Isolated here — rather than interleaved into build_data.rb —
  # so the one part of the pipeline that can fail over the network (and the
  # one part a test would want to stub) sits by itself. Selected via
  # Providers.resolve (lib/providers.rb), which is what makes this
  # swappable rather than hardcoded.
  class OpenMeteo
    ENDPOINT = "https://api.open-meteo.com/v1/forecast"

    # Coordinates go in the query string, so hundreds of resorts in one GET
    # would run past common URL-length limits (~8 KB). 100 locations is ~2 KB.
    BATCH_SIZE = 100

    # resorts: [{ "lat" => Float, "lon" => Float }, ...]
    # returns: { "fetched_at" => String, "conditions" => [{ "snow_depth_cm" =>,
    #            "temperature_c" =>, "weather_code" => }, ...] }, conditions
    #            in the same order as resorts.
    def fetch(resorts)
      fetched_at = nil
      conditions = []

      resorts.each_slice(BATCH_SIZE) do |batch|
        raw = fetch_batch(batch)
        raw.each do |entry|
          cur = entry.fetch("current")
          fetched_at = cur["time"]
          conditions << {
            "snow_depth_cm" => (cur["snow_depth"] * 100).round(1),
            "temperature_c" => cur["temperature_2m"],
            "weather_code" => cur["weather_code"],
          }
        end
      end

      { "fetched_at" => fetched_at, "conditions" => conditions }
    end

    private

    def fetch_batch(batch)
      lats = batch.map { |r| r["lat"] }.join(",")
      lons = batch.map { |r| r["lon"] }.join(",")
      url = URI("#{ENDPOINT}?latitude=#{lats}&longitude=#{lons}" \
                "&current=snow_depth,temperature_2m,weather_code&timezone=Asia%2FTokyo")
      raw = JSON.parse(Net::HTTP.get(url))

      # Open-Meteo answers a single location with a bare object rather than a
      # one-element array, and the last batch has exactly one location
      # whenever the resort count is 1 more than a multiple of BATCH_SIZE.
      raw = [raw] if batch.length == 1 && raw.is_a?(Hash) && raw.key?("current")

      unless raw.is_a?(Array) && raw.length == batch.length
        got = raw.is_a?(Array) ? raw.length : raw.inspect
        raise "Open-Meteo response shape mismatch: expected #{batch.length} entries, got #{got}"
      end
      raw
    end
  end
end
