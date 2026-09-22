#!/usr/bin/env ruby
# Writes tmp/debug.html: index.html with test/browser/debug_hooks.js spliced in
# just before assets/app.js, for driving the real page in a browser (see that
# file for what it adds, and README "Browser checks"). tmp/ is gitignored.
#
#   ruby scripts/build_debug_page.rb
#   ruby -run -e httpd . -p 8000
#   open http://localhost:8000/tmp/debug.html?winter
require 'fileutils'

ROOT = File.expand_path("..", __dir__)
html = File.read(File.join(ROOT, "index.html"), encoding: "UTF-8")
hooks = File.read(File.join(ROOT, "test", "browser", "debug_hooks.js"), encoding: "UTF-8")

marker = %(<script src="assets/app.js)
raise "index.html has no assets/app.js script tag; run scripts/build_data.rb first" unless html.include?(marker)

html = html.sub(marker) { "<script>\n#{hooks}\n</script>\n#{marker}" }
# tmp/debug.html sits one level down from the assets it references
html = html.gsub(%(src="assets/), %(src="../assets/)).gsub(%(href="assets/), %(href="../assets/))

FileUtils.mkdir_p(File.join(ROOT, "tmp"))
File.write(File.join(ROOT, "tmp", "debug.html"), html)
STDERR.puts "Wrote tmp/debug.html"
