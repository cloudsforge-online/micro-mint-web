/**
 * EVERY `--cf-*` THIS APP NAMES IS DEFINED BY THE DESIGN SYSTEM.
 *
 * An undefined custom property does not fall back to something sensible. `var(--cf-nope)` makes
 * the whole declaration invalid at computed-value time, so `border: 1px solid var(--cf-nope)`
 * removes the border — silently, in a file that looks correct, in a browser that reports nothing.
 *
 * THIS REPOSITORY SHIPPED EXACTLY THAT, and this test exists because of it. `src/styles.css`
 * named ten properties `ui/packages/ui/src/tokens.css` does not declare — `--cf-border`,
 * `--cf-radius-md`, `--cf-space-1` … `--cf-space-5`, `--cf-status-good`, `--cf-status-warn`,
 * `--cf-status-crit` — across 79 uses. Three were written `var(--cf-status-good,
 * var(--cf-border))`, where the FALLBACK was undefined too, and two more fell back to
 * `--cf-accent` and `--cf-fg`, which are defined and are the wrong colour: those rendered
 * confidently in the wrong hue rather than failing.
 *
 * So the borders, radii, paddings and status colours on this page were simply absent, in a
 * stylesheet that reads as correct and a browser that reports nothing. `micro-trade-web` found it
 * by writing this check for itself; every other frontend in the estate was clean, which is what
 * made it this repository's drift rather than a template defect.
 *
 * The 1..5 spacing scale was mapped onto the estate's named scale at the same 4/8/12/16/24
 * progression it was clearly reaching for: 2xs, sm, lg, xl, 2xl.
 *
 * The second rule: a `var(--undefined, #hex)` is not a repair. It is a hard-coded colour wearing a
 * token's clothes, and it stops following the substrate the moment the ash ramp changes. So this
 * file also refuses a literal colour in the stylesheet outright.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/**
 * The stylesheet with its comments stripped.
 *
 * Same lesson as nginx.conf and the `try_files` grep: the file's own header QUOTES the property
 * names it forbids, in order to explain why they are forbidden. A scan over the raw text matches
 * the warning and fails a correct file — which is a check that can only be satisfied by deleting
 * the explanation.
 */
const CSS = readFileSync(at('src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Where a micro-ui checkout is, in the order CI and a developer's machine put it. */
const TOKENS = [process.env['CLOUDSFORGE_UI_TOKENS'], at('../ui/packages/ui/src/tokens.css')]
  .filter((v): v is string => Boolean(v))
  .find((p) => existsSync(p))

/** Every `--cf-*` the stylesheet READS. */
function referenced(): string[] {
  return [...new Set([...CSS.matchAll(/var\((--cf-[a-z0-9-]+)/g)].map((m) => m[1] ?? ''))].sort()
}

describe('the stylesheet names only tokens that exist', () => {
  it('references a real number of them, so this cannot pass on an empty match', () => {
    assert.ok(referenced().length >= 20, `found ${referenced().length} token references`)
  })

  if (TOKENS === undefined) {
    it('SKIPPED: no micro-ui checkout — CI checks one out and requires this to run', () => {
      assert.ok(true)
    })
  } else {
    const tokens = readFileSync(TOKENS, 'utf8')
    const defined = new Set(
      [...tokens.matchAll(/^\s*(--cf-[a-z0-9-]+)\s*:/gm)].map((m) => m[1] ?? ''),
    )

    it('reads a tokens file with tokens in it', () => {
      assert.ok(defined.size >= 60, `found ${defined.size} definitions in tokens.css`)
    })

    it('every property this stylesheet reads is declared by the design system', () => {
      const undefinedOnes = referenced().filter((name) => !defined.has(name))
      assert.deepEqual(
        undefinedOnes,
        [],
        `src/styles.css reads ${undefinedOnes.join(', ')}, which tokens.css does not define. ` +
          'An undefined custom property invalidates the whole declaration.',
      )
    })

    it('names none of the ten properties micro-mint-web invented', () => {
      // Spelled out so the failure message names the right file to go and read, rather than only
      // saying "undefined". These are the ones this estate has actually shipped by mistake.
      const KNOWN_BAD = [
        '--cf-border',
        '--cf-radius-md',
        '--cf-space-1',
        '--cf-space-2',
        '--cf-space-3',
        '--cf-space-4',
        '--cf-space-5',
        '--cf-status-good',
        '--cf-status-warn',
        '--cf-status-crit',
      ]
      for (const bad of KNOWN_BAD) {
        // Boundary-aware: a plain `includes('var(--cf-space-2')` also matches the REAL
        // `var(--cf-space-2xl)`, and a test that fails on a correct token is a test somebody
        // deletes.
        assert.doesNotMatch(
          CSS,
          new RegExp(`var\\(${bad}(?![a-z0-9-])`),
          `src/styles.css uses ${bad}, which does not exist. The real name is in the header of that file.`,
        )
      }
      // And none of them has quietly appeared upstream either — if one had, this list would need
      // revising rather than enforcing.
      for (const bad of KNOWN_BAD) {
        assert.ok(!defined.has(bad), `${bad} now exists upstream; this test is out of date`)
      }
    })

    it('the names the brief warned about are not tokens, and the real ones are', () => {
      // Asserted in both directions so a reader can see which is which without opening tokens.css.
      //
      // `--cf-critical` came off this list: the design-system foundation added it as a real
      // severity token with a measured `-text` step, so asserting its absence pinned a fact that
      // had stopped being true.
      for (const wrong of ['--cf-border', '--cf-warning', '--cf-font']) {
        assert.ok(!defined.has(wrong), `${wrong} is defined after all; this comment is wrong`)
      }
      assert.ok(defined.has('--cf-critical'), '--cf-critical is the severity token; it must exist')
      for (const right of [
        '--cf-line',
        '--cf-line-strong',
        '--cf-danger',
        '--cf-warn',
        '--cf-font-sans',
      ]) {
        assert.ok(defined.has(right), `${right} is not defined; the stylesheet is built on it`)
      }
    })

    it('every severity carries a non-text step AND a text step, and they are different names', () => {
      // The rule that replaced "--cf-critical does not exist". A `color:` takes the `-text` step;
      // a border or a background takes the bare one.
      for (const level of ['good', 'warn', 'critical']) {
        assert.ok(defined.has(`--cf-${level}`), `--cf-${level} is missing`)
        assert.ok(defined.has(`--cf-${level}-text`), `--cf-${level}-text is missing`)
      }
    })

    it('the two aliases this stylesheet sets text in point at the TEXT steps', () => {
      /*
       * `--cf-danger` and `--cf-success` survive as aliases of `--cf-critical-text` and
       * `--cf-good-text` (tokens.css), deliberately: every existing `color: var(--cf-danger)`
       * in the estate became AA-compliant without the repository using it being touched, and every
       * existing border use kept clearing the non-text floor it needs. src/styles.css sets text in
       * `--cf-danger` twice, so this is the assertion that keeps those two legible.
       */
      assert.match(tokens, /--cf-success:\s*var\(--cf-good-text\)/)
      assert.match(tokens, /--cf-danger:\s*var\(--cf-critical-text\)/)
    })
  }
})

describe('no hard-coded colour, including one hiding in a fallback', () => {
  it('declares no hex literal', () => {
    const hexes = [...CSS.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])
    assert.deepEqual(hexes, [], `src/styles.css hard-codes ${hexes.join(', ')}`)
  })

  it('declares no rgb/rgba/hsl literal', () => {
    const fns = [...CSS.matchAll(/\b(rgba?|hsla?)\(/g)].map((m) => m[0])
    assert.deepEqual(fns, [], `src/styles.css hard-codes ${fns.join(', ')}`)
  })

  it('uses no var() fallback at all, because a fallback is where a literal hides', () => {
    // `var(--cf-something, #b28e1e)` passes every "uses tokens" check ever written and is a
    // hard-coded colour. There is no legitimate use for one here: every property this file reads
    // is asserted above to exist.
    const fallbacks = [...CSS.matchAll(/var\(--cf-[a-z0-9-]+\s*,/g)].map((m) => m[0])
    assert.deepEqual(fallbacks, [], `src/styles.css uses a var() fallback: ${fallbacks.join(', ')}`)
  })
})
