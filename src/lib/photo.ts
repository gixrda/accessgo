/**
 * Ridimensiona una foto (lato lungo max 1280 px) e la converte in JPEG.
 * Ridisegnarla su canvas elimina anche i metadati EXIF, inclusa la posizione GPS dello scatto.
 */
export async function toJpegDataUrl(file: File, max = 1280, quality = 0.8): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL('image/jpeg', quality);
}
