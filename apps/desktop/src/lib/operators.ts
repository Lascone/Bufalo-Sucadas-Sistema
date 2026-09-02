import { loadJson, saveJson } from './local-store';

export type Operator = {
  id: string;
  name: string;
  /** Relative to app root (Vite public / packaged dist). */
  avatar: string;
};

const ACTIVE_KEY = 'active-operator-id';

/** Fixed operators for now (photos in public/avatars). */
export const OPERATORS: Operator[] = [
  { id: 'keity', name: 'Keity', avatar: './avatars/keity.png' },
  { id: 'steve', name: 'Steve', avatar: './avatars/steve.png' },
];

export function listOperators(): Operator[] {
  return OPERATORS;
}

export function getOperator(id: string | null | undefined): Operator | undefined {
  if (!id) return undefined;
  return OPERATORS.find((o) => o.id === id);
}

export function getOperatorByName(name: string): Operator | undefined {
  const n = name.trim().toLowerCase();
  return OPERATORS.find((o) => o.name.toLowerCase() === n);
}

export function loadActiveOperatorId(): string | null {
  const id = loadJson<string | null>(ACTIVE_KEY, null);
  return id && getOperator(id) ? id : null;
}

export function persistOperatorId(id: string | null) {
  if (!id) {
    saveJson(ACTIVE_KEY, null);
    return;
  }
  saveJson(ACTIVE_KEY, id);
}
