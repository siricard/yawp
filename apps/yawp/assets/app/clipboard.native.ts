import {Share} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';

export async function copyText(text: string): Promise<void> {
  Clipboard.setString(text);
}

export async function shareText(text: string): Promise<void> {
  await Share.share({message: text});
}
