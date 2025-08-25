export function nanoid(size = 12) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let id = "";
  const arr = new Uint8Array(size);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < size; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < size; i++) {
    const v = arr.at(i) ?? 0;
    const idx = v % alphabet.length;
    id += alphabet.charAt(idx);
  }
  return id;
}
