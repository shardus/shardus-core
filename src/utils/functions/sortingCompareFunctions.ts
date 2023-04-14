export const sortAsc = (a, b): 0 | 1 | -1 => {
  return a === b ? 0 : a < b ? -1 : 1
}

export const sortDec = (a, b): 0 | 1 | -1 => {
  return a === b ? 0 : a > b ? -1 : 1
}

export const sort_i_Asc = (a, b): 0 | 1 | -1 => {
  return a.i === b.i ? 0 : a.i < b.i ? -1 : 1
}

export const sort_id_Asc = (a, b): 0 | 1 | -1 => {
  return a.id === b.id ? 0 : a.id < b.id ? -1 : 1
}

export const sortHashAsc = (a, b): 0 | 1 | -1 => {
  return a.hash === b.hash ? 0 : a.hash < b.hash ? -1 : 1
}

export const sortTimestampAsc = (a, b): 0 | 1 | -1 => {
  return a.timestamp === b.timestamp ? 0 : a.timestamp < b.timestamp ? -1 : 1
}

export const sortAscProp = (a, b, propName): 0 | 1 | -1 => {
  // eslint-disable-next-line security/detect-object-injection
  const aVal = a[propName]
  // eslint-disable-next-line security/detect-object-injection
  const bVal = b[propName]
  return aVal === bVal ? 0 : aVal < bVal ? -1 : 1
}

export const sortDecProp = (a, b, propName): 0 | 1 | -1 => {
  // eslint-disable-next-line security/detect-object-injection
  const aVal = a[propName]
  // eslint-disable-next-line security/detect-object-injection
  const bVal = b[propName]
  return aVal === bVal ? 0 : aVal > bVal ? -1 : 1
}
