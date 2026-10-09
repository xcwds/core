# examples/minimal

The smallest @xcwds app, on [`@xcwds/sveltekit`](../../packages/sveltekit) with Tailwind, the
example plugin [`examples/plugin-hello`](../plugin-hello) (a build hook, a route, a client entry
with a settings field and a saved value, a worker entry and a page component), and the
official plugins:

- [`@xcwds/plugin-shell`](../../packages/plugin-shell): header, navigation (Home and Hello),
  toasts, Home and the error page;
- [`@xcwds/plugin-offline`](../../packages/plugin-offline) and
  [`@xcwds/plugin-update`](../../packages/plugin-update), with their notice and banner in the
  shell's stack;
- [`@xcwds/plugin-theme`](../../packages/plugin-theme) and
  [`@xcwds/plugin-install`](../../packages/plugin-install), with their picker and card on Home.

```sh
pnpm build        # build/, at the root
pnpm build:base   # build-sub/, under the base path /sub
pnpm test:e2e     # both builds, then Playwright against each
```
