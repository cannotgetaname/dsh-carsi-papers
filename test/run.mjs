/**
 * Test runner: unit tests, then page-function tests in a headless Chrome.
 *
 *   node test/run.mjs            # everything that needs no network
 *   node test/run.mjs --unit     # unit tests only
 *
 * Live site checks live in test/tools.mjs (search + download) and are opt-in.
 */
import { createTester, withHeadlessBrowser } from './helpers.mjs'
import unit from './unit.test.mjs'
import pageScripts from './page-scripts.test.mjs'

const unitOnly = process.argv.includes('--unit')
const tester = createTester('carsi-papers tests')

console.log('unit tests')
await unit(tester)

if (!unitOnly) {
  console.log('\nbrowser tests (headless fixtures)')
  try {
    await withHeadlessBrowser(async browser => {
      await pageScripts(tester, browser)
    })
  } catch (error) {
    tester.section('browser tests')
    tester.ok('headless browser available', false, error.message)
  }
}

const passed = tester.summary()
process.exitCode = passed ? 0 : 1
