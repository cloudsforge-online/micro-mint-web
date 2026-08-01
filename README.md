# micro-mint-web

Forge Create's browser client: the catalogue, the token launch form, the status page a customer
polls while a deploy runs, and the public project page a prospective buyer reads. It is a static
bundle served by nginx and nothing else — no server, no session store, no database.

> **This bundle enforces nothing, and none of its refusals are a boundary.** `mint` verifies the
> bearer on every route that needs one (`authenticate`, `mint/src/server.ts:647`), and `ownedToken`
> answers **404** for another customer's order — the same answer as "no such order", deliberately,
> so that order ids cannot be enumerated (`mint/src/server.ts:598-603`). What this app contributes
> is that a screen offers what the service will actually accept, and says why when it will not.
>
> It also **stores no environment**. There is no `.env`, no `define`, no `envPrefix` and no
> `VITE_` variable anywhere: every host is resolved from `window.location` at runtime, so the image
> that passed CI is byte-for-byte the image that reaches production.
> (`test/no-build-time-config.test.ts`, plus a grep in CI so deleting the test does not delete the
> rule.)

## The API surface it calls

Read out of `mint/src/server.ts`, one route at a time. **The line numbers are checked mechanically,
not trusted**: `test/mint.test.ts` reads the sibling checkout and fails if any route is not
registered at the line cited here, and CI fails if that cross-check did not run.

| Method | Path | Authenticates | Idempotency-Key | What it does | Verified at |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/v1/catalogue` | **no** | — | the three contracts and the Shards price | `mint/src/server.ts:340` |
| `POST` | `/v1/tokens` | yes | — | opens an order; charges nothing, deploys nothing | `mint/src/server.ts:359` |
| `GET` | `/v1/tokens` | yes | — | the caller's launches, newest first, at most 100 | `mint/src/server.ts:417` |
| `GET` | `/v1/tokens/:id` | yes | — | one order and every deploy attempt | `mint/src/server.ts:430` |
| `POST` | `/v1/tokens/:id/pay` | yes | — | debits Shards; **201** fresh, **200** replayed | `mint/src/server.ts:454` |
| `POST` | `/v1/tokens/:id/deploy` | yes | — | **202 and a status URL. Reaches no chain.** | `mint/src/server.ts:491` |
| `PUT` | `/v1/tokens/:id/page` | yes | — | replaces the whole project-page document | `mint/src/server.ts:546` |
| `GET` | `/v1/tokens/:id/page` | **no** | — | the public project page, chain facts included | `mint/src/server.ts:572` |

**Two of them make no `authenticate()` call**, and this client sends no bearer to either
(`auth: false` in `src/lib/mint.ts`). That is not a nicety: the estate has already shipped a client
that sent a token to a route which never wanted one and then had to reason about a 403 that was
never about authorisation. Both refusals are asserted in `test/routes.test.ts` and, against the
service's own handler bodies, in `test/mint.test.ts`.

**No route on mint requires an `Idempotency-Key`.** There is no `withIdempotentRoute` wrapper and no
header read anywhere in the service — unlike four wallet routes and five market mutations, which
answer 400 without one. Mint gets the same protection from state: `pay` runs one conditional UPDATE
guarded by `and status = 'awaiting_payment'` (`mint/src/tokens.ts:326-332`) and `deploy` enqueues
with `onConflict: 'keep'` (`mint/src/server.ts:523-528`). `test/mint.test.ts` asserts the absence, so
nobody "fixes" this client by adding a header the service ignores.

### The 202 is the most important thing on this list

`POST /v1/tokens/:id/deploy` authenticates, checks the mainnet allowlist, runs one conditional
UPDATE, enqueues a job and returns a `Location` header. It reaches no chain. The service's own file
header (`mint/src/server.ts:8-23`) explains why the work cannot live inside the request: a rolling
deploy, Cloudflare's 100-second origin timeout and a client that gives up can each land between the
broadcast and the write that records the transaction hash, orphaning a real contract and deploying
a second one.

So this app **never renders "deployed" because a button returned successfully**. It renders
"accepted, and queued", then re-reads the order. `test/render.test.ts` asserts that the acceptance
branch contains no claim that a contract exists, and that the deployed state is only ever printed
from `token.status`.

## Client routes

Declared once, in `src/lib/routes.ts`, and checked against `src/app.tsx` and `nginx.conf` by
`test/routes.test.ts`.

| Path | Screen | Session | Why |
| --- | --- | --- | --- |
| `/` | Catalogue | **no** | the front page has to answer "what can I launch, and what does it cost" to somebody who has not signed in |
| `/launch` | The order form | yes | `POST /v1/tokens` authenticates |
| `/tokens`, `/tokens/:id` | Your launches, and one launch's status | yes | `GET /v1/tokens` authenticates |
| `/projects/:id` | The public project page | **no** | it is the address a project shares outward |

`/projects` carries no navigation entry on purpose: there is nothing to navigate to without an id.
That is `label: null` in the route table, and the test asserts it is the **only** unlabelled route,
because a hidden route is normally a mistake.

**An unknown address answers 404, not 200.** `nginx.conf` enumerates the real routes and lets
everything else fall through to `error_page 404 /index.html`, which serves the same bundle while
keeping the status. The usual `try_files $uri /index.html` would make "page not found" a success
that crawlers index and monitors call healthy — and on this surface the wrong address is usually a
project page somebody was *sent*.

## What it refuses that the service accepts, and why

One thing, and it is deliberate.

`POST /v1/tokens` validates the FEATURE SET (`variantFor`, `mint/src/server.ts:383`) and never looks
at the cap. The cap is first checked by `constructorArgs` (`mint/src/catalogue.ts:113-119`), which
runs from `mint/src/families.ts:326` — **inside the deploy job**. So ordering a pausable token with
no cap is accepted, payable, and then fails terminally at deploy; and `failed` is terminal
(`mint/src/tokens.ts:52`) and deliberately excluded from `CLAIMABLE` (`mint/src/tokens.ts:68-73`),
so there is no retry. The customer has paid for a token that cannot be built.

`src/lib/launch.ts` refuses the combination at order time. It costs nothing anybody wanted, and
`test/launch.test.ts` walks every variant in both directions. **The real fix is in mint, at the
order route** — reported, not worked around, and this guard comes out the day it lands.

Everything else in that file is a mirror of a rule the service already enforces, each with the line
it mirrors, and the tests assert that none of them is *stricter* than the service: a client that
refuses something the service accepts has quietly removed a feature, and nobody files a bug against
a form that says no.

## The supply unit, which is the trap in this product

`supply` reaches the contract constructor **unscaled** — `_mint(recipient_, initialSupply_)` in all
three contracts (`mint/src/contracts/ForgeTokens.sol:38`, `:58`, `:83`). `decimals` is a separate
constructor argument that only changes how a wallet *displays* a balance.

So `1000000` with 18 decimals is not a million tokens; it is 0.000000000001 of one, permanently, on
a contract that may never mint again. The form shows the wallet-display value under the field for
**every** draft, not only the surprising ones — a hint that appears only when something looks wrong
is read as an error rather than as the unit — and offers the scaled value as a one-click correction
rather than applying it. This app does not get to decide what somebody's token supply is.

## The project page never renders the order record

04-domain-model §5.3, implemented at `mint/src/projectpages.ts:1-21`: supply, authorities, network
and contract address come from the **indexer**. The order says what the customer asked for at the
moment they paid; the chain says what is true now, and the two diverge the instant an owner mints
past the order or pauses transfers.

`src/pages/project.tsx` therefore shows the order's numbers **nowhere at all** — not greyed out, not
labelled "requested". A figure on screen is a figure a reader will quote. When the indexer has no
answer the page says so and names the reason (`onchainUnavailable`), and the risk indicators are
three-state: `null` renders as "not observed on chain", which is not "no". Asserted by
`test/render.test.ts` and again by a grep in CI.

## Configuration

**There is none, and that is the point.** No `.env`, no build argument for an API URL, no
`import.meta.env`. Two inputs exist and neither is configuration:

| Input | Where | What it is |
| --- | --- | --- |
| `RELEASE` | `Dockerfile` build arg | the git sha, written into a `<meta name="cf-release">` tag and read by `src/lib/obs.ts` so an error report names the deploy that produced it. It identifies the artefact; it does not tell it where it is running. |
| `window.location` | the browser | every CloudsForge host, resolved per call through `cloudsforgeHosts()` from `@cloudsforge/ui` |

## Running it

```bash
pnpm install
pnpm dev          # http://localhost:5184
pnpm typecheck
pnpm test         # 242 tests, no DOM, no network
pnpm build
```

**Start `mint` on port 4004, not its default 4000.** The surface registry gives `create`
`devPort: 4004` (`ui/packages/ui/src/surfaces.ts:214-225`) and that is the port this bundle calls on
localhost; `mint/src/env.ts:251` defaults `PORT` to 4000 and `mint/.env.example:38` sets it to 4000.
So:

```bash
cd ../mint && PORT=4004 pnpm dev
```

A literal port here would be a second, unversioned copy of the registry, and the copy is the one
that goes stale — so it is a line in this README and a pinned assertion in `test/hosts.test.ts`
instead, and the disagreement is reported to micro-ui. It is invisible in production, where this
bundle and mint share `create.<apex>` and every request is relative.

The full test suite runs with no sibling checkouts. `test/mint.test.ts`'s cross-repository half —
the one that verifies every route citation against `mint/src/server.ts` — skips when micro-mint is
not beside this repository, and **CI makes that absence fatal**: it checks the service out, asserts
the cross-check really ran, and then bends one citation by a single line and requires the suite to
go red. A check that passes when its input is missing is worse than no check.

### The image

```bash
docker build -t mint-web --build-context uipkg=../ui .
docker run --rm -p 8080:8080 mint-web
```

The second build context is the unpublished `@cloudsforge/ui` workspace, mirroring the `link:`
specifier in `package.json`. It disappears when the design system is published — see below.

## Brand chrome

From `brand/assets/create/`, copied byte-identical and checked in both directions by
`test/brand-chrome.test.ts`: every icon `index.html` links must exist, every icon in `public/` must
be linked, and each must match the brand source byte for byte.

This surface **does** ship an og card, unlike the operator console, which deliberately does not
(18-build-status.md §3.3k: nobody shares an operator console outward). Forge Create is the opposite
case — a project page exists to be sent to somebody — so `og-1200x630.png` is shipped, linked with a
relative path, and asserted. The og metadata is declared exactly once, which is checked, because
`foresight-web/index.html` declares three of the properties twice.

The web template's Dockerfile once did not copy `public/` into the build context, so every frontend
cut from it built an image whose `dist/` had no icons — while a brand test exactly like this one
passed, because it reads the source tree. Four frontends shipped that way. **It is fixed upstream**
(`micro-web-template/Dockerfile:39`) and every frontend in the estate carries the line, so the
guard here is a guard rather than a correction; it was re-checked against the source for this
repository rather than inherited from a sibling's comment, because that claim had already gone
stale in `micro-admin-web`.

It is still worth its lines. Reading a Dockerfile is not evidence that an image serves a file, so
the `COPY public ./public` line is asserted by the brand test **and probed against the running
container** in CI — which is the only check that could have caught the original defect. On this
surface a missing asset would also 404 the og card and blank the preview on every shared project
page.

## Known gaps

- **The cap is not validated at order time by mint.** Described above. Guarded here; the real fix is
  in `mint`. Reported.
- **`GET /v1/tokens` takes no cursor** and returns at most 100 rows (`mint/src/server.ts:422`), so
  older launches cannot be listed. The list says so when it is full rather than stopping silently at
  a round number.
- **The project-page editor edits two of six fields.** `links`, `team` and `roadmap` are structured
  entries; the form sends `[]` for them, which is what the handler stores for an absent value anyway
  (`mint/src/server.ts:555-557`), and the panel says the save replaces the whole document. A partial
  PUT would silently blank them, which is why they are sent explicitly rather than omitted.
- **`verificationStatus` is displayed and not actionable.** Claiming or verifying a project is
  market's surface, not this one.
- **Two defects this repository was briefed to correct were already fixed**, and are recorded here
  rather than repeated as live: the web template reads `/auth/me` nested
  (`micro-web-template/src/lib/auth.tsx:26-32`, `:98-99`) and copies `public/`
  (`micro-web-template/Dockerfile:39`), and hub-web, site, foresight-web, foresight-admin-web and
  market-web all match on both. `micro-admin-web`'s comments still describe them as open. Every
  citation in this README was re-read against source for that reason.
- **`foresight-web/index.html` declares `og:type`, `og:title` and `og:description` twice**
  (lines 30-33 and 43-46). The second set wins in every crawler and the first is dead text nobody
  edits. Still live; reported. `test/brand-chrome.test.ts` here asserts each property appears once.
- **The one temporary thing:** `@cloudsforge/ui` is consumed as `link:../ui/packages/ui` because it
  is unpublished. The day it is published the specifier becomes `^1.0.0`, and with it go the second
  checkout in `.github/workflows/ci.yml`, the `uipkg` build context in the `Dockerfile`, and the
  whole bespoke CI file — which is replaced by a call to `micro-org`'s reusable `web-ci.yml`. The
  measured target in docs/ecosystem/03 §5 is zero repositories with a bespoke CI file; treat this
  one as a liability with a deletion date.
