export function* primeIterator<T>(
  array: T[],
  startIdx?: number,
  stride?: number
) {
  // Pick random stride and startIdx if not given
  if (startIdx === undefined) startIdx = getRndInteger(0, array.length - 1)
  if (stride === undefined) stride = getRndInteger(1, array.length - 1)

  // Calculate the smallest prime num > length
  const length = array.length
  const primeLength = biggerPrime(length)

  let currIdx = startIdx
  do {
    // Increment currIdx by stride
    currIdx += stride
    // Make currIdx wrap around if > primeLength
    currIdx = currIdx % primeLength
    // Either return element at currIdx or continue striding
    if (currIdx >= length) continue
    yield array[currIdx]
  } while (currIdx !== startIdx)
}

// Calculates the smallest prime bigger than n
function biggerPrime(n: number) {
  let m = Math.sqrt(n)
  for (let i = 2; i < m; i++) {
    if (n % i === 0) {
      n += 1
      m = Math.sqrt(n)
      i = 2
    }
  }
  return n
}

// Get random integer between min and max inclusive
function getRndInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
