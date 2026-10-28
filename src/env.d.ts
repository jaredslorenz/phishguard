/** CSS imported by the content script is bundled as a string (esbuild text loader) and injected into a shadow root. */
declare module "*.css" {
  const css: string;
  export default css;
}
