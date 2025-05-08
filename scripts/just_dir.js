export function dir(obj) {
  const keys = new Set();

  while (obj && obj !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(obj)) {
      keys.add(key);
    }
    // for (const sym of Object.getOwnPropertySymbols(obj)) {
    //   keys.add(sym);
    // }
    obj = Object.getPrototypeOf(obj);
  }

  return [...keys].sort();
}

