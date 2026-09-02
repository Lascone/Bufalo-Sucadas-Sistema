import { app } from 'electron';
import path from 'node:path';

/** Mesma pasta do instalador — dev e build usam o mesmo perfil de dados. */
export const USER_DATA_FOLDER = 'Bufalo Sucata Gestor';

export function configureUserDataPath(): string {
  const target = path.join(app.getPath('appData'), USER_DATA_FOLDER);
  app.setPath('userData', target);
  return target;
}
