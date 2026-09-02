import { loadJson, saveJson } from './local-store';

const KEY = 'partner-photos';

function readMap(): Record<string, string> {
  return loadJson<Record<string, string>>(KEY, {});
}

export function getPartnerPhotoPath(partnerName: string): string | undefined {
  const key = partnerName.trim();
  if (!key) return undefined;
  return readMap()[key];
}

export async function resolvePartnerPhotoSrc(partnerName: string): Promise<string | null> {
  const photoPath = getPartnerPhotoPath(partnerName);
  if (!photoPath) return null;
  if (photoPath.startsWith('data:')) return photoPath;
  if (window.ferrogestor?.getPartnerPhotoDataUrl) {
    return window.ferrogestor.getPartnerPhotoDataUrl(photoPath);
  }
  return null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1]! : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function savePartnerPhoto(partnerName: string, file: File): Promise<string> {
  const name = partnerName.trim();
  if (!name) throw new Error('Nome do recebedor inválido');

  const ext = (file.name.split('.').pop() ?? 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const base64 = await fileToBase64(file);

  let photoPath = `${name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}.${ext}`;
  if (window.ferrogestor?.savePartnerPhoto) {
    const res = await window.ferrogestor.savePartnerPhoto({
      partnerName: name,
      base64,
      ext,
    });
    photoPath = res.photoPath;
  }

  const map = readMap();
  map[name] = photoPath;
  saveJson(KEY, map);
  return photoPath;
}

export async function clearPartnerPhoto(partnerName: string): Promise<void> {
  const name = partnerName.trim();
  const map = readMap();
  const prev = map[name];
  if (prev && window.ferrogestor?.deletePartnerPhoto && !prev.startsWith('data:')) {
    await window.ferrogestor.deletePartnerPhoto(prev);
  }
  delete map[name];
  saveJson(KEY, map);
}

/** Renomeia a chave quando o recebedor muda de nome nas configurações. */
export function renamePartnerPhoto(oldName: string, newName: string): void {
  const from = oldName.trim();
  const to = newName.trim();
  if (!from || !to || from === to) return;
  const map = readMap();
  if (!map[from]) return;
  map[to] = map[from];
  delete map[from];
  saveJson(KEY, map);
}

export function partnerInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}
