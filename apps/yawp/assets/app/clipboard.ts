import {Platform, Share} from 'react-native';

export async function copyText(text: string): Promise<void> {
  if (
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    navigator.clipboard
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  await Share.share({message: text});
}

export async function shareText(text: string): Promise<void> {
  if (
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    typeof (navigator as {share?: unknown}).share === 'function'
  ) {
    await (navigator as Navigator & {share: (data: {text: string}) => Promise<void>}).share({
      text,
    });
    return;
  }

  await Share.share({message: text});
}
