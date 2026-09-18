require_relative 'test_helper'
require 'season_curve'

class SeasonCurveTest < Minitest::Test
  # A resort roughly like Niseko: typical_peak_cm 220, typical_min_c -12,
  # typical_edge_c 4. These exact figures were hand-verified via the browser
  # console earlier in the project; the point of this suite is to stop
  # needing to do that by hand again.
  PEAK_CM = 220
  MIN_C = -12
  EDGE_C = 4

  def test_bell_peaks_at_exactly_1_on_the_peak_offset
    assert_in_delta 1.0, SeasonCurve.bell(SeasonCurve::PEAK_OFFSET), 1e-9
  end

  def test_bell_is_symmetric_around_the_peak_offset
    peak = SeasonCurve::PEAK_OFFSET
    assert_in_delta SeasonCurve.bell(peak - 30), SeasonCurve.bell(peak + 30), 1e-9
  end

  def test_bell_decreases_moving_away_from_the_peak
    peak = SeasonCurve::PEAK_OFFSET
    assert SeasonCurve.bell(peak) > SeasonCurve.bell(peak + 10)
    assert SeasonCurve.bell(peak + 10) > SeasonCurve.bell(peak + 40)
  end

  def test_temperature_is_the_edge_value_at_season_start
    assert_in_delta EDGE_C, SeasonCurve.temperature_at(0, min_c: MIN_C, edge_c: EDGE_C), 1e-9
  end

  def test_temperature_is_the_min_value_at_the_peak_offset
    t = SeasonCurve.temperature_at(SeasonCurve::PEAK_OFFSET, min_c: MIN_C, edge_c: EDGE_C)
    assert_in_delta MIN_C, t, 1e-9
  end

  def test_temperature_is_the_edge_value_at_season_end
    t = SeasonCurve.temperature_at(SeasonCurve::TOTAL_DAYS, min_c: MIN_C, edge_c: EDGE_C)
    assert_in_delta EDGE_C, t, 1e-9
  end

  def test_temperature_clamps_beyond_the_season_bounds
    # day_offset far past TOTAL_DAYS should clamp to the same edge value,
    # not keep extrapolating past it
    t_far = SeasonCurve.temperature_at(1000, min_c: MIN_C, edge_c: EDGE_C)
    t_end = SeasonCurve.temperature_at(SeasonCurve::TOTAL_DAYS, min_c: MIN_C, edge_c: EDGE_C)
    assert_in_delta t_end, t_far, 1e-9
  end

  def test_generate_returns_one_point_every_step_days
    depth_curve, temp_curve = SeasonCurve.generate(peak_cm: PEAK_CM, min_c: MIN_C, edge_c: EDGE_C)
    expected_points = (SeasonCurve::TOTAL_DAYS / SeasonCurve::STEP_DAYS) + 1
    assert_equal expected_points, depth_curve.length
    assert_equal expected_points, temp_curve.length
  end

  def test_generate_depth_curve_matches_known_values
    depth_curve, = SeasonCurve.generate(peak_cm: PEAK_CM, min_c: MIN_C, edge_c: EDGE_C)

    assert_equal ["2025-12-01", 54.9], depth_curve.first
    assert_equal ["2026-04-30", 54.9], depth_curve.last

    peak_index = SeasonCurve::PEAK_OFFSET / SeasonCurve::STEP_DAYS
    assert_equal ["2026-02-14", 220.0], depth_curve[peak_index]
  end

  def test_generate_temp_curve_matches_known_values
    _, temp_curve = SeasonCurve.generate(peak_cm: PEAK_CM, min_c: MIN_C, edge_c: EDGE_C)

    assert_equal ["2025-12-01", 4.0], temp_curve.first
    assert_equal ["2026-04-30", 4.0], temp_curve.last

    peak_index = SeasonCurve::PEAK_OFFSET / SeasonCurve::STEP_DAYS
    assert_equal ["2026-02-14", -12.0], temp_curve[peak_index]
  end

  def test_generate_depth_never_goes_negative
    depth_curve, = SeasonCurve.generate(peak_cm: 0, min_c: MIN_C, edge_c: EDGE_C)
    depth_curve.each { |_, cm| assert cm >= 0 }
  end
end
