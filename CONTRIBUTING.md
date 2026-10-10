# Contributing

Requirements: Node 24 (`.tool-versions`, or `mise install`) and pnpm (`corepack enable`).

```sh
pnpm install
pnpm build          # build the packages (examples import their output)
pnpm check          # type check every package and example
pnpm lint           # prettier + eslint
pnpm test:unit --run
pnpm test:e2e       # builds examples/minimal at the root and under /sub, then runs Playwright
pnpm test:starter   # generates an app with npm create @xcwds into examples/starter and tests it
```

Before pushing, run `pnpm build && pnpm check && pnpm lint && pnpm publint && pnpm test:unit --run`
and, if you touched anything the examples use, `pnpm test:e2e` (and `pnpm test:starter` for
anything a generated app uses, including `packages/create`).

- Playwright needs Chromium: `pnpm --filter @xcwds/example-minimal exec playwright install chromium`,
  or point `CHROMIUM_PATH` at a Chromium binary you already have.
- e2e tests use `@xcwds/testing/playwright` (its config preset, `gotoHydrated`, the GitHub
  Pages-like server, the tap-target audit) and block service workers unless a test opts in with
  `test.use({ serviceWorkers: 'allow' })`.
- Add a changeset (`pnpm changeset`) to PRs that change a package.
- Design changes go through an RFC in `docs/rfc/`.
