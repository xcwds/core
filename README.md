# @xcwds

Everyday tools that never phone home, as a framework: make your own installable, offline-first
PWA from a config file and a list of plugins. Modelled on [Fastify](https://fastify.dev)'s
plugin system and extracted from [xcwds.github.io](https://github.com/xcwds/xcwds.github.io).

Work in progress; nothing is published to npm yet. The plan is [#1](https://github.com/xcwds/core/issues/1)
and the design is [RFC 0001](docs/rfc/0001-architecture.md).

## Packages

| Package                                  | What it is                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| [`@xcwds/core`](packages/core)           | The kernel: plugins, hooks, decorators, config, storage, settings         |
| [`@xcwds/sveltekit`](packages/sveltekit) | The SvelteKit integration: Vite plugin, config, hooks, `<App>`, `persist` |
| [`@xcwds/testing`](packages/testing)     | Test kit: `buildTestApp()` for Vitest, Playwright helpers and presets     |

## Repository

- `packages/*`: published packages, all under the `@xcwds` npm scope
- `examples/minimal`: the smallest working app, used by the e2e tests
- `examples/plugin-hello`: a tiny plugin with every kind of entry, used by `examples/minimal`
- `docs/rfc`: design decisions

See [CONTRIBUTING.md](CONTRIBUTING.md) to build and test.

## License

[MIT](LICENSE)
