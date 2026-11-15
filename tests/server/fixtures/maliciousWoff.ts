// 67-byte WOFF: one "cmap" table whose zlib payload (78 9c 05) makes opentype.js's inflater loop forever.
export function hangingWoff(): Uint8Array {
  const out = new Uint8Array(67);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x774f4646); // "wOFF"
  view.setUint32(4, 0x00010000); // TrueType flavour
  view.setUint32(8, 67); // total length
  view.setUint16(12, 1); // numTables
  view.setUint32(16, 12 + 16 + 100); // totalSfntSize
  view.setUint32(44, 0x636d6170); // "cmap"
  view.setUint32(48, 64); // offset
  view.setUint32(52, 3); // compressed length
  view.setUint32(56, 100); // original length (larger, so it is inflated)
  out.set([0x78, 0x9c, 0x05], 64);
  return out;
}
