require_relative 'test_helper'
require 'providers'

class ProvidersRegistryTest < Minitest::Test
  def setup
    @original_env = ENV["SNOWPACK_PROVIDER"]
  end

  def teardown
    ENV["SNOWPACK_PROVIDER"] = @original_env
  end

  def test_resolve_by_explicit_name
    assert_instance_of Providers::OpenMeteo, Providers.resolve("open_meteo")
    assert_instance_of Providers::Fixture, Providers.resolve("fixture")
  end

  def test_resolve_defaults_to_open_meteo_with_no_name_and_no_env_var
    ENV.delete("SNOWPACK_PROVIDER")
    assert_instance_of Providers::OpenMeteo, Providers.resolve
  end

  def test_resolve_honors_the_snowpack_provider_env_var
    ENV["SNOWPACK_PROVIDER"] = "fixture"
    assert_instance_of Providers::Fixture, Providers.resolve
  end

  def test_an_explicit_name_wins_over_the_env_var
    ENV["SNOWPACK_PROVIDER"] = "fixture"
    assert_instance_of Providers::OpenMeteo, Providers.resolve("open_meteo")
  end

  def test_resolve_raises_a_clear_error_for_an_unknown_provider
    error = assert_raises(RuntimeError) { Providers.resolve("jma") }
    assert_match(/Unknown data provider "jma"/, error.message)
    assert_match(/open_meteo/, error.message)
    assert_match(/fixture/, error.message)
  end
end
