require_relative 'test_helper'
require 'digest'

# Guards two things at once: that scripts/build_data.rb's cache-busting
# actually stamps the real content hash of assets/app.js and
# assets/styles.css into index.html, and that index.html in the repo is
# actually up to date with the assets it references (catches "edited
# assets/app.js but forgot to re-run the build script" before it ships).
class BuildOutputTest < Minitest::Test
  ROOT = File.expand_path("..", __dir__)

  def test_index_html_references_the_current_content_hash_of_each_asset
    html = File.read(File.join(ROOT, "index.html"), encoding: "UTF-8")

    %w[app.js styles.css].each do |asset|
      content = File.read(File.join(ROOT, "assets", asset), encoding: "UTF-8")
      expected_hash = Digest::MD5.hexdigest(content)[0, 8]
      found = html.include?("assets/#{asset}?v=#{expected_hash}")
      actual = html[/assets\/#{Regexp.escape(asset)}\?v=([0-9a-f]+)/, 1] || "(no version tag found)"
      assert found,
        "index.html references assets/#{asset}?v=#{actual}, but the file's current content " \
        "hashes to #{expected_hash} — run `ruby scripts/build_data.rb` to regenerate it"
    end
  end
end
