import { primeIterator } from './PrimeIterator'

const numbers = [...Array(10).keys()]

let out = ''

for (const num of primeIterator(numbers)) {
  out += num
}

console.log(out)
