// heic-decode (libheif WASM) nie ma własnych typów.
declare module "heic-decode" {
  type DecodedImage = { width: number; height: number; data: Uint8ClampedArray };
  /** Obraz z kontenera: wymiary z nagłówka, piksele dopiero po decode(). */
  type HeifImageHandle = { width: number; height: number; decode: () => Promise<DecodedImage> };
  type HeifImageList = HeifImageHandle[] & { dispose: () => void };
  function decode(opts: { buffer: Buffer | Uint8Array | ArrayBuffer }): Promise<DecodedImage>;
  namespace decode {
    function all(opts: { buffer: Buffer | Uint8Array | ArrayBuffer }): Promise<HeifImageList>;
  }
  export default decode;
}
