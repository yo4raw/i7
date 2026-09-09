import { STORAGE_KEYS, loadJson, saveJson } from './storage';

/** 共有画像の保存形式。value は `<select>` の値と localStorage の保存値を兼ねる */
export const SHARE_IMAGE_FORMATS = [
  { value: 'png', label: 'PNG', type: 'image/png' },
  { value: 'jpg', label: 'JPG', type: 'image/jpeg' },
  { value: 'webp', label: 'WebP', type: 'image/webp' },
] as const;

export type ShareImageFormat = (typeof SHARE_IMAGE_FORMATS)[number]['value'];

/** 非可逆形式 (JPG / WebP) の品質。PNG では無視される */
export const LOSSY_QUALITY = 0.8;

export function loadShareImageFormat(): ShareImageFormat {
  const saved = loadJson<string>(STORAGE_KEYS.SHARE_IMAGE_FORMAT, 'png');
  return SHARE_IMAGE_FORMATS.some(f => f.value === saved) ? (saved as ShareImageFormat) : 'png';
}

export function saveShareImageFormat(format: ShareImageFormat): void {
  saveJson(STORAGE_KEYS.SHARE_IMAGE_FORMAT, format);
}

/** DOM ノードを選択形式の data URL に描画する。scale 2・白背景は全共有画像で共通 */
export async function renderShareImage(
  node: Node,
  format: ShareImageFormat,
  filter?: (n: Node) => boolean,
): Promise<string> {
  const { domToDataUrl } = await import('modern-screenshot');
  const { type } = SHARE_IMAGE_FORMATS.find(f => f.value === format) ?? SHARE_IMAGE_FORMATS[0];
  return domToDataUrl(node, { scale: 2, backgroundColor: '#ffffff', type, quality: LOSSY_QUALITY, filter });
}

/** data URL をファイルとしてダウンロードさせる */
export function downloadDataUrl(dataUrl: string, basename: string, format: ShareImageFormat): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${basename}.${format}`;
  document.body.append(a);
  a.click();
  a.remove();
}
