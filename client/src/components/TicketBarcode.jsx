const CODE_39 = {
  '0': '101001101101',
  '1': '110100101011',
  '2': '101100101011',
  '3': '110110010101',
  '4': '101001101011',
  '5': '110100110101',
  '6': '101100110101',
  '7': '101001011011',
  '8': '110100101101',
  '9': '101100101101',
  A: '110101001011',
  B: '101101001011',
  C: '110110100101',
  D: '101011001011',
  E: '110101100101',
  F: '101101100101',
  G: '101010011011',
  H: '110101001101',
  I: '101101001101',
  J: '101011001101',
  K: '110101010011',
  L: '101101010011',
  M: '110110101001',
  N: '101011010011',
  O: '110101101001',
  P: '101101101001',
  Q: '101010110011',
  R: '110101011001',
  S: '101101011001',
  T: '101011011001',
  U: '110010101011',
  V: '100110101011',
  W: '110011010101',
  X: '100101101011',
  Y: '110010110101',
  Z: '100110110101',
  '-': '100101011011',
  '*': '100101101101',
}

const MODULE_WIDTH = 2
const CHARACTER_GAP = 2

export default function TicketBarcode({ code }) {
  const characters = `*${code.toUpperCase()}*`
  if ([...characters].some((character) => !CODE_39[character])) {
    return <p className="font-mono text-xs text-muted">Barcode unavailable for this ticket code.</p>
  }

  const bars = []
  let x = 0
  for (const character of characters) {
    const pattern = CODE_39[character]
    for (let index = 0; index < pattern.length; index += 1) {
      if (pattern[index] === '1') {
        bars.push(<rect key={`${character}-${x}`} x={x} y="0" width={MODULE_WIDTH} height="48" />)
      }
      x += MODULE_WIDTH
    }
    x += CHARACTER_GAP
  }

  return (
    <svg
      role="img"
      aria-label={`Code 39 barcode for ticket ${code}`}
      viewBox={`0 0 ${x} 48`}
      className="h-12 w-full max-w-72"
      preserveAspectRatio="xMinYMid meet"
    >
      {bars}
    </svg>
  )
}
