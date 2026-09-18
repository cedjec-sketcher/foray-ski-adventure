require 'json'

module Providers
  # Serves conditions from a captured snapshot (data/fixture_conditions.json)
  # instead of the network. Real practical value, not just a demo of the
  # interface: lets `ruby scripts/build_data.rb` run with no internet access
  # (offline development, a flaky connection, CI dry-runs) — the same
  # fixture file was captured from a real Open-Meteo response, so it's
  # realistic data, just frozen in time rather than live.
  class Fixture
    def initialize(path: File.expand_path("../../data/fixture_conditions.json", __dir__))
      @path = path
    end

    # resorts: [{ "id" => String, ... }, ...]
    # returns the same shape as Providers::OpenMeteo#fetch
    def fetch(resorts)
      snapshot = JSON.parse(File.read(@path, encoding: "UTF-8"))
      by_id = snapshot.fetch("conditions")

      conditions = resorts.map do |r|
        entry = by_id[r["id"]]
        raise "No fixture conditions for resort #{r['id'].inspect} in #{@path}" unless entry
        entry
      end

      { "fetched_at" => snapshot.fetch("fetched_at"), "conditions" => conditions }
    end
  end
end
