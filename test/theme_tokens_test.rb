require_relative 'test_helper'

# Guards against exactly the bug that shipped once already: the light
# :root block, the @media (prefers-color-scheme: dark) block, and the
# :root[data-theme="dark"] block are hand-maintained duplicates, and it's
# easy to update two of the three and not notice the third is now missing
# a token (caught by a lucky grep last time, not by anything automatic).
class ThemeTokensTest < Minitest::Test
  CSS_PATH = File.expand_path("../assets/styles.css", __dir__)

  def custom_property_names(block_text)
    block_text.scan(/--[\w-]+(?=\s*:)/).uniq.sort
  end

  def test_light_and_dark_root_blocks_declare_the_same_set_of_tokens
    css = File.read(CSS_PATH, encoding: "UTF-8")

    # No token block here nests braces (custom-property declarations don't),
    # so matching up to the next "}" is enough to isolate each block, even
    # though the @media one is itself nested inside an outer @media rule.
    bare = css[/:root\{([^}]*)\}/m, 1]
    media_dark = css[/:root:not\(\[data-theme="light"\]\)\{([^}]*)\}/m, 1]
    attr_dark = css[/:root\[data-theme="dark"\]\{([^}]*)\}/m, 1]

    refute_nil bare, "expected a bare :root{...} block in assets/styles.css"
    refute_nil media_dark, 'expected a :root:not([data-theme="light"]){...} block in assets/styles.css'
    refute_nil attr_dark, 'expected a :root[data-theme="dark"]{...} block in assets/styles.css'

    bare_props = custom_property_names(bare)
    media_dark_props = custom_property_names(media_dark)
    attr_dark_props = custom_property_names(attr_dark)

    refute_empty bare_props, "the bare :root block appears to declare no custom properties"

    assert_equal bare_props, media_dark_props,
      "@media (prefers-color-scheme: dark)'s :root block has different tokens than the light :root block " \
      "(missing: #{(bare_props - media_dark_props).inspect}, extra: #{(media_dark_props - bare_props).inspect})"
    assert_equal bare_props, attr_dark_props,
      ':root[data-theme="dark"] has different tokens than the light :root block ' \
      "(missing: #{(bare_props - attr_dark_props).inspect}, extra: #{(attr_dark_props - bare_props).inspect})"
  end
end
