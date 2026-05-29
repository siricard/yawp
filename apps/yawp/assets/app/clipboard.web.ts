export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
}

export async function shareText(text: string): Promise<void> {
  if (
    typeof navigator !== 'undefined' &&
    typeof (navigator as {share?: unknown}).share === 'function'
  ) {
    await (
      navigator as Navigator & {share: (data: {text: string}) => Promise<void>}
    ).share({text});
  }
}
