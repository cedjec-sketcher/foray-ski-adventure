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
  # pairs sampled every STEP_DAYS from SEASON_START to SEASON_END.
  def self.generate(peak_cm:, min_c:, edge_c:)
    depth_curve = []
    temp_curve = []
    d = 0
    while d <= TOTAL_DAYS
      day = SEASON_START + d
      depth = bell(d) * peak_cm
      depth_curve << [day.iso8601, [depth, 0].max.round(1)]
      temp_curve << [day.iso8601, temperature_at(d, min_c: min_c, edge_c: edge_c).round(1)]
      d += STEP_DAYS
    end
    [depth_curve, temp_curve]
  end
end
