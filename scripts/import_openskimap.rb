#!/usr/bin/env ruby
# Adds Japanese ski areas from OpenSkiMap (https://openskidata.org) to
# data/resorts.json. Safe to re-run: see OpenSkiMapImport.merge.
#
#   ruby scripts/import_openskimap.rb                  # downloads (cached in tmp/)
#   ruby scripts/import_openskimap.rb path/to/ski_areas.geojson
#
# OpenSkiMap asks for automated downloads at most once a day, so the download
# is cached in tmp/ and reused until you delete it.
require 'json'
require 'net/http'
require 'uri'
require 'fileutils'
require_relative '../lib/openskimap_import'

ROOT = File.expand_path("..", __dir__)
RESORTS_PATH = File.join(ROOT, "data", "resorts.json")
SOURCE_URL = "https://tiles.openskimap.org/geojson/ski_areas.geojson"

# curated resort id => the OpenSkiMap areas (by raw name) that are that resort
MATCHERS = {
  "niseko" => /niseko united|ニセコユナイテッド/i,
  "rusutsu" => /rusutsu|ルスツ/i,
  "furano" => /furano ski resort|富良野スキー場/i,
  "kiroro" => /kiroro|キロロ/i,
  "sapporo_teine" => /sapporo teine|サッポロテイネ/i,
  "asahidake" => /asahidake|旭岳/i,
  "zao" => /zao onsen ski resort|蔵王温泉スキー場/i,
  "appi" => /appi kogen|安比高原/i,
  "geto" => /geto kogen|夏油/i,
  "hakkoda" => /hakkoda|八甲田/i,
  "nozawa" => /nozawa onsen|野沢温泉/i,
  "hakuba_happo" => /happo|八方/i,
  "hakuba_cortina" => /hakuba cortina|白馬コルチナ/i,
  "shiga_kogen" => /shiga kogen|志賀高原|発哺/i,
  "myoko" => /suginohara|杉ノ原/i,
  "naeba" => /naeba|苗場/i,
  "gala_yuzawa" => /gala yuzawa|ガーラ湯沢/i,
  "madarao" => /madarao kogen mountain|斑尾高原スキー場/i,
  "tazawako" => /tazawako|たざわ湖/i,
  "kagura" => /kagura|かぐら/i,
}.freeze

source = ARGV[0]
unless source
  FileUtils.mkdir_p(File.join(ROOT, "tmp"))
  source = File.join(ROOT, "tmp", "ski_areas.geojson")
  unless File.exist?(source)
    STDERR.puts "Downloading #{SOURCE_URL} ..."
    File.binwrite(source, Net::HTTP.get(URI(SOURCE_URL)))
  end
end

geojson = JSON.parse(File.read(source, encoding: "UTF-8"))
areas = OpenSkiMapImport.summarize_all(geojson)
existing = JSON.parse(File.read(RESORTS_PATH, encoding: "UTF-8"))

merged = OpenSkiMapImport.merge(existing, areas, MATCHERS)

unmatched = MATCHERS.keys - merged.select { |r| r["osm_ids"] }.map { |r| r["id"] }
STDERR.puts "WARNING: no OpenSkiMap area matched curated resort(s): #{unmatched.join(', ')}" unless unmatched.empty?

File.write(RESORTS_PATH, JSON.pretty_generate(merged) + "\n")

added = merged.length - existing.length
by_tier = merged.group_by { |r| r["tier"] }.map { |t, rs| "#{t}=#{rs.length}" }.join(" ")
STDERR.puts "Considered #{areas.length} operating downhill areas; added #{added}; total #{merged.length} (#{by_tier})"
