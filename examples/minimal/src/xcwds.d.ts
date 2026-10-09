// The spike's virtual module (spike/xcwds.js); @xcwds/sveltekit will ship these types (#10).
declare module 'virtual:xcwds/client' {
	export const plugins: [{ onBoot?: (options: unknown) => void }, unknown][];
}
