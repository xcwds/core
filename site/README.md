# @xcwds/site

The @xcwds docs site, built with @xcwds itself: installable, and every page works offline. It
renders the guides in [`docs/`](../docs) and each package's README, and adds each plugin's
options, decorators and settings from its TypeScript source. The [Tally](../examples/plugin-tally)
page runs the plugin the guide builds.

```sh
pnpm build                          # at the root: the packages the site uses
pnpm --filter @xcwds/site dev       # http://localhost:5173
pnpm --filter @xcwds/site test:e2e  # builds at the root and under /xcwds, then runs Playwright
```

- `src/lib/server/pages.ts` lists the pages; `xcwds.config.ts` passes them to a small local
  plugin (`plugin-pages`) that adds them to the route registry, so the shell titles them and
  the build prerenders them.
- `src/lib/server/render.ts` turns Markdown into HTML. Relative links go to the site page for
  that file, or to the file on GitHub; a link to a missing file fails the build.
- `src/lib/server/api.ts` reads a plugin's options type and its `declare module '@xcwds/core'`
  additions with the TypeScript parser.

`.github/workflows/docs.yml` deploys `main` to GitHub Pages once CI has passed.
