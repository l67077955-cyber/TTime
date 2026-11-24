const markers = [
  ['<think>', '</think>'],
  ['＜think＞', '＜/think＞'],
  ['《think》', '《/think》']
]

export class ThinkBlockFilter {
  private pending = ''
  private closingMarker = ''
  public sawReasoning = false

  push(chunk: string): string {
    this.pending += chunk
    let result = ''
    while (this.pending) {
      const start = this.pending.search(/[<＜《]/)
      if (start === -1) {
        if (!this.closingMarker) result += this.pending
        this.pending = ''
        break
      }
      if (!this.closingMarker) result += this.pending.slice(0, start)
      this.pending = this.pending.slice(start)
      const lower = this.pending.toLowerCase()
      const candidates = this.closingMarker ? [this.closingMarker] : markers.flat()
      const marker = candidates.find((candidate) => lower.startsWith(candidate))
      if (marker) {
        this.pending = this.pending.slice(marker.length)
        this.closingMarker = markers.find(([opening]) => opening === marker)?.[1] ?? ''
        this.sawReasoning = true
      } else if (candidates.some((candidate) => candidate.startsWith(lower))) {
        break
      } else {
        if (!this.closingMarker) result += this.pending[0]
        this.pending = this.pending.slice(1)
      }
    }
    return result
  }

  finish(): string {
    const result = this.closingMarker ? '' : this.pending
    this.pending = ''
    return result
  }
}
