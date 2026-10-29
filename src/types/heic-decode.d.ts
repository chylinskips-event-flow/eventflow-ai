// heic-decode (libheif WASM) nie ma własnych typów.
declare module "heic-decode" {
  type DecodedImage = { width: number; height: number; data: Uint8ClampedArray };
  function decode(opts: { buffer: Buffer | Uint8Array | ArrayBuffer }): Promise<DecodedImage>;
  export default decode;
}
