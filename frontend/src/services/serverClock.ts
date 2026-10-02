/** Offset between the server clock and this device, so lock countdowns do not trust a wrong local clock. */
let offsetMs = 0

export function setServerClock(serverTimeIso: string, receivedAt: number = Date.now()): void {
  const server = new Date(serverTimeIso).getTime()
  if (Number.isFinite(server)) offsetMs = server - receivedAt
}

/** Epoch ms on the server's clock (as of the last response that carried serverTime). */
export function serverNow(): number {
  return Date.now() + offsetMs
}

export function resetServerClock(): void {
  offsetMs = 0
}
