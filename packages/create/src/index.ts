/** `@xcwds/create`'s programmatic API: what `npm create @xcwds` and `xcwds add` use. */
export {
	CATALOG,
	PLUGIN_IDS,
	RECOMMENDED,
	TEMPLATES,
	pluginId,
	withRequirements,
	type PluginId,
	type PluginInfo,
	type TemplateName
} from './catalog.js';
export {
	DEFAULT_ICON,
	appFiles,
	slug,
	type GenerateOptions,
	type PackageManager
} from './generate.js';
export { addPlugins, installedPlugins, type AddResult } from './add.js';
export { writeApp } from './files.js';
