declare module "png-chunks-extract" {
  const fn: (bytes: Uint8Array) => { name: string; data: Uint8Array }[];
  export default fn;
}

declare module "png-chunks-encode" {
  const fn: (chunks: { name: string; data: Uint8Array }[]) => Uint8Array;
  export default fn;
}
