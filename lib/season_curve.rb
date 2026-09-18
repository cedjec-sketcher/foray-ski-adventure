require 'date'

# Generates the illustrative typical-season snow depth and temperature
# curves used when no real historical data exists for a resort yet.
# Pure computation, no I/O — the values here are exactly what were
# hand-verified via the browser console earlier in the project.
module SeasonCurve
  SEASON_START = Date.new(2025, 12, 1)
  SEASON_END = Date.new(2026, 4, 30)
  PEAK_DATE = Date.new(2026, 2, 14)
  TOTAL_DAYS = (SEASON_END - SEASON_START).to_i
  PEAK_OFFSET = (PEAK_DATE - SEASON_START).to_i
  STEP_DAYS = 3
  BELL_WIDTH = 45

  # A bell curve over day_offset (days since SEASON_START), peaking at 1.0
  # when day_offset == peak_offset.
  def self.bell(day_offset, peak_offset = PEAK_OFFSET, width: BELL_WIDTH)
    Math.exp(-((day_offset - peak_offset) ** 2) / (2.0 * width ** 2))
  end

  # Mild at the season edges (edge_c), coldest (min_c) at the same
  # mid-February trough the snow depth curve peaks on.
  def self.temperature_at(day_offset, min_c:, edge_c:, peak_offset: PEAK_OFFSET)
    x = (day_offset - peak_offset) / peak_offset.to_f
    x = [[x, -1.0].max, 1.0].min
    min_c + (edge_c - min_c) * (x ** 2)
  end

  # Returns [depth_curve, temp_curve], each an array of [iso_date, value]
  # pairs sampled every step_days from season_start to season_end. The
  # keyword args default to this module's own constants (a Northern
  # Hemisphere Dec-Apr season) but config/season.json overrides them for the
  # real build — see scripts/build_data.rb. Kept as parameters rather than
  # read from the config file in here, so this module stays pure/no-I/O and
  # its default behavior (what the existing tests exercise) never depends on
  # a file being present.
  def self.generate(peak_cm:, min_c:, edge_c:,
                     season_start: SEASON_START, season_end: SEASON_END,
                     peak_date: PEAK_DATE, bell_width: BELL_WIDTH, step_days: STEP_DAYS)
    total_days = (season_end - season_start).to_i
    peak_offset = (peak_date - season_start).to_i

    depth_curve = []
    temp_curve = []
    d = 0
    while d <= total_days
      day = season_start + d
      depth = bell(d, peak_offset, width: bell_width) * peak_cm
      depth_curve << [day.iso8601, [depth, 0].max.round(1)]
      temp = temperature_at(d, min_c: min_c, edge_c: edge_c, peak_offset: peak_offset)
      temp_curve << [day.iso8601, temp.round(1)]
      d += step_days
    end
    [depth_curve, temp_curve]
  end
end
