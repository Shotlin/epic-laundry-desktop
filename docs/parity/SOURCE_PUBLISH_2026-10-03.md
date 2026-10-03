# Source publication verification — 3 October 2026

Destination: `Shotlin/epic-laundry-desktop`, branch `main`.

This publication includes the pending frontend, backend, adapters, sample-workspace
launcher, regression tests, parity worklogs and operator manual. Generated builds,
local databases, credentials, signing material and private third-party account
captures are excluded. Evidence images in `docs/parity/evidence` use synthetic
local test records.

## Fresh local verification

| Check | Result |
|---|---|
| Server typecheck, build and regression commands | 62/62 passed |
| Web build, static accessibility and connected-web adapter contracts | 6/6 passed |
| Desktop workspace, connector configuration, navigation, recovery and release controls | 6/6 passed |
| Fresh production empty-state browser walkthrough | 1/1 passed |
| Production dependency audits: server, webapp and desktop | Zero reported vulnerabilities |
| Browser interaction suite | 108 checks passed in the full run; 14 selected layout/accessibility checks passed, and the two stale expectations were corrected and re-run successfully |

The release check corrected stale migration-head expectations, a date-dependent
report fixture, selectors left behind by the new full-screen booking layout,
and two server tests that had not isolated their runtime database/key storage.
Compatible dependency updates remove the reported production advisories.
Booking now displays paise exactly rather than rounding to whole rupees, and a
confirmed wallet reservation shows the remaining Pay Later balance before save.
The full web development dependency audit still reports the existing Tailwind 3
build-tool `braces` advisory; migrating to Tailwind 4 requires a separate build
compatibility review. These packages are development dependencies.

Run the three scopes of `scripts/verify-release-source.mjs` to repeat the source
checks. Run `webapp`'s `test:e2e` and `test:e2e:empty` after building its static
assets. Do not replace generated assets during a browser run.

## Customer distribution gates

Source publication is complete only when the pushed commit is verified on remote
`main`. It is not evidence of a signed or deployed customer release.

Before customer distribution:

1. Provide approved release metadata, Authenticode credentials, Ed25519 manifest
   keys and the configured HTTPS update feed. The production release guard must
   pass; do not bypass it.
2. Verify connected vendor persistence, retries and provider payment behavior
   with an authorized non-production account. Local mocked connector checks do
   not certify live vendor/provider integrations.
3. Accept the signed installer in an isolated profile and test the actual
   printer, physical labels, recovery and production configuration.
4. Resolve the remaining tax-policy and parity acceptance boundaries listed in
   `NEEDS_VERIFICATION.md`, including the GST None booking path for a store whose
   governed tax profile requires GST.

No installer is installed over existing store data as part of this source push.
