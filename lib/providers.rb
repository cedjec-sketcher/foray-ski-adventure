require_relative 'providers/open_meteo'
require_relative 'providers/fixture'

module Providers
  REGISTRY = {
    "open_meteo" => OpenMeteo,
    "fixture" => Fixture,
  }.freeze

  DEFAULT_NAME = "open_meteo"

  # Picks a provider by name (falling back to the SNOWPACK_PROVIDER env var,
  # then DEFAULT_NAME) and returns an instance of it. build_data.rb calls
  # .fetch(resorts) on whatever comes back without knowing which one it got.
  def self.resolve(name = nil)
    name ||= ENV["SNOWPACK_PROVIDER"] || DEFAULT_NAME
    klass = REGISTRY[name]
    unless klass
      raise "Unknown data provider #{name.inspect}. Known providers: #{REGISTRY.keys.join(', ')}"
    end
    klass.new
  end
end
