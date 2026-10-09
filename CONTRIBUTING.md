# Contributing

Requirements: Node 24 (`.tool-versions`, or `mise install`) and pnpm (`corepack enable`).

```sh
pnpm install
pnpm build          # build the packages (examples import their output)
pnpm check          # type check every package and example
pnpm lint           # prettier + eslint
pnpm test:unit --run
pnpm test:e2e       # builds examples/minimal and runs Playwright against it
```

Before pushing, run `pnpm build && pnpm check && pnpm lint && pnpm publint && pnpm test:unit --run`
and, if you touched anything the examples use, `pnpm test:e2e`.

- Playwright needs Chromium: `pnpm --filter @xcwds/example-minimal exec playwright install chromium`,
  or point `CHROMIUM_PATH` at a Chromium binary you already have.
- e2e tests block service workers unless a test opts in with `test.use({ serviceWorkers: 'allow' })`.
- Add a changeset (`pnpm changeset`) to PRs that change a package.
- Design changes go through an RFC in `docs/rfc/`.
