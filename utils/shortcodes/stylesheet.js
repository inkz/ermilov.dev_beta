const path = require('path')
const sass = require('sass')
const postcss = require('postcss')
const postcssPresetEnv = require('postcss-preset-env')
const autoprefixer = require('autoprefixer')
const outdent = require('outdent')

// Twelvety options from .twelvety.js
const twelvety = require('@12ty')

// Render styles using dart-sass
// Documentation: https://sass-lang.com/documentation/js-api/
function renderStyles(data) {
  try {
    const result = sass.compileString(data, {
      // Allow `@import` and `@use` from files within styles directory and node modules
      loadPaths: [
        path.join(process.cwd(), twelvety.dir.input, twelvety.dir.styles),
        path.join(process.cwd(), 'node_modules')
      ],
      syntax: twelvety.indentedSass ? 'indented' : 'scss'
    })
    return Promise.resolve(result.css)
  } catch (error) {
    return Promise.reject(error)
  }
}

module.exports = function(config) {
  // Each stylesheet is stored within an array for its given 'chunk'
  const STYLES = {}

  // Store each stylesheet within its chunk
  // The chunk defaults to the URL of the current page
  // Use language 'scss' for Liquid highlighting
  config.addPairedShortcode('stylesheet', function(content, _language, chunk = this.page.url) {
    // Make sure that the chunk exists
    if (!STYLES.hasOwnProperty(chunk))
      STYLES[chunk] = []

    // Remove leading spaces
    content = outdent.string(content)

    // Add the stylesheet to the chunk, if it's not already in it
    if (!STYLES[chunk].includes(content))
      STYLES[chunk].push(content)

    return ''
  })

  // Render the styles for the given chunk
  config.addShortcode('styles', async function(chunk = this.page.url) {
    // If there aren't any styles, just return nothing
    if (!STYLES.hasOwnProperty(chunk))
      return ''

    // Separate @use/@forward statements from other styles
    // @use and @forward must come before any other rules in Sass
    const useStatements = []
    const otherStyles = []

    for (const style of STYLES[chunk]) {
      const lines = style.split('\n')
      const styleUseStatements = []
      const styleOtherLines = []

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('@use ') || trimmed.startsWith('@forward ')) {
          styleUseStatements.push(line)
        } else {
          styleOtherLines.push(line)
        }
      }

      // Collect unique @use statements
      for (const useStmt of styleUseStatements) {
        if (!useStatements.includes(useStmt)) {
          useStatements.push(useStmt)
        }
      }

      // Only add other styles if there are any non-empty lines
      const otherContent = styleOtherLines.join('\n').trim()
      if (otherContent) {
        otherStyles.push(otherContent)
      }
    }

    // Join with @use statements first, then other styles
    const joined = [...useStatements, ...otherStyles].join('\n')
    // Render sass using dart-sass
    const rendered = await renderStyles(joined)
    // Input path used by PostCSS
    const from = path.resolve(process.cwd(), this.page.inputPath)
    // Use autoprefixer and postcss-preset-env for compatibility
    return await postcss([postcssPresetEnv, autoprefixer]).process(rendered, { from })
  })

  // Reset all styles on re-runs
  config.on('beforeWatch', function() {
    for (const chunk in STYLES) {
      delete STYLES[chunk]
    }
  })

  // Watch the styles directory
  config.addWatchTarget(path.join(process.cwd(), twelvety.dir.input, twelvety.dir.styles))
}
