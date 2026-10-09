# examples/minimal

The smallest @xcwds app, on [`@xcwds/sveltekit`](../../packages/sveltekit) with the example
plugin [`examples/plugin-hello`](../plugin-hello) (a build hook, a route, a client entry with a
settings field and a saved value, a worker entry and a page component).

```sh
pnpm build        # build/, at the root
pnpm build:base   # build-sub/, under the base path /sub
pnpm test:e2e     # both builds, then Playwright against each
```
