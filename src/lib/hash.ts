// Lightweight 32-bit FNV-1a hash producing an 8-hex-digit string
// BigInt is avoided for broad browser compatibility (Safari 13 target)
export function fnv1a64Hex(input: string): string {
  let hash = 0x811c9dc5 >>> 0; // 32-bit offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Math.imul for 32-bit multiply; FNV prime 16777619
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
