/**
 * Copies a post-`atob` binary string (each char code ≤ 0xFF) into a fresh byte
 * array. Callers keep their own `atob`/URI-decode/error handling — this only
 * deduplicates the charCode loop shared by data-URL and ciphertext decoding.
 */
export function binaryStringToBytes(binary: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
