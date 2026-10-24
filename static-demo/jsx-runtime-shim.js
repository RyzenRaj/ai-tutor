// Maps the automatic JSX runtime onto the React UMD global loaded from cdnjs.
const R = globalThis.React;
export const Fragment = R.Fragment;
export function jsx(type, props, key) {
  return R.createElement(type, key === undefined ? props : { ...props, key });
}
export const jsxs = jsx;
