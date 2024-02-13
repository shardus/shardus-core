/**
 * @returns true if the string is 0x-prefixed or not, and contains only an even number hex characters.
 */
export function isAnyHexString(str: string, exactBytes?: number): boolean {
  if (!/^(0x)?[0-9a-fA-F]+$/.test(str)) return false
  if (str.length % 2 !== 0) return false
  if (exactBytes !== undefined) {
    const adjust = str.startsWith('0x') ? 2 : 0
    if ((str.length - adjust) / 2 !== exactBytes) return false
  } 
  return true
}

export function isUnprefixedHexString(str: string, exactBytes?: number): boolean {
  return isAnyHexString(str, exactBytes) && !str.startsWith('0x')
}

export function isPrefixedHexString(str: string, exactBytes?: number): boolean {
  return isAnyHexString(str, exactBytes) && str.startsWith('0x')
}

/**
 * @returns the string without a '0x' prefix if it has one.
 */
export function stripHexStringPrefix(str: string): string {
  return str.startsWith('0x') ? str.slice(2) : str
}
