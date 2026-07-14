import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';

export type ContactTypeCode =
  | 'CLIENT'
  | 'SUPPLIER'
  | 'BUYER_COMPANY'
  | 'CARRIER'
  | 'EMPLOYEE'
  | 'PARTNER'
  | 'OTHER';

export const CONTACT_TYPE_OPTIONS: Array<{ code: ContactTypeCode; label: string }> = [
  { code: 'CLIENT', label: 'Cliente' },
  { code: 'SUPPLIER', label: 'Fornecedor' },
  { code: 'BUYER_COMPANY', label: 'Empresa compradora' },
  { code: 'CARRIER', label: 'Transportadora' },
  { code: 'EMPLOYEE', label: 'Funcionário' },
  { code: 'PARTNER', label: 'Parceiro' },
  { code: 'OTHER', label: 'Outro' },
];

export type ContactRecord = {
  id: string;
  personType: 'INDIVIDUAL' | 'COMPANY';
  legalName: string;
  tradeName: string;
  types: ContactTypeCode[];
  cpf: string;
  cnpj: string;
  rg: string;
  phonePrimary: string;
  phoneSecondary: string;
  whatsapp: string;
  email: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  notes: string;
  pixKey: string;
  contactPersonName: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const KEY = 'contacts';

export function listContacts(activeOnly = false): ContactRecord[] {
  const all = loadJson<ContactRecord[]>(KEY, []).sort((a, b) =>
    a.legalName.localeCompare(b.legalName, 'pt-BR'),
  );
  return activeOnly ? all.filter((c) => c.active) : all;
}

export function getContact(id: string): ContactRecord | undefined {
  return listContacts().find((c) => c.id === id);
}

export function searchContacts(query: string, activeOnly = false): ContactRecord[] {
  const q = query.trim().toLowerCase();
  const base = listContacts(activeOnly);
  if (!q) return base;
  const digits = q.replace(/\D/g, '');
  return base.filter((c) => {
    const blob = [
      c.legalName,
      c.tradeName,
      c.cpf,
      c.cnpj,
      c.phonePrimary,
      c.phoneSecondary,
      c.whatsapp,
      c.email,
      c.city,
      c.contactPersonName,
      ...c.types,
    ]
      .join(' ')
      .toLowerCase();
    if (blob.includes(q)) return true;
    if (digits && (c.cpf + c.cnpj + c.phonePrimary + c.whatsapp).replace(/\D/g, '').includes(digits)) {
      return true;
    }
    return false;
  });
}

type ContactInput = Omit<ContactRecord, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export async function upsertContact(input: ContactInput): Promise<ContactRecord> {
  const name = input.legalName.trim();
  if (!name) throw new Error('Informe o nome / razão social.');
  if (!input.types.length) throw new Error('Selecione ao menos um tipo de contato.');

  const all = listContacts();
  const now = new Date().toISOString();

  if (input.id) {
    const idx = all.findIndex((c) => c.id === input.id);
    if (idx < 0) throw new Error('Contato não encontrado');
    const updated: ContactRecord = {
      ...all[idx],
      ...input,
      id: input.id,
      legalName: name,
      tradeName: input.tradeName.trim(),
      updatedAt: now,
    };
    all[idx] = updated;
    saveJson(KEY, all);
    await enqueueSyncOp({
      entityType: 'Contact',
      entityId: updated.id,
      action: 'UPDATE',
      payload: updated as unknown as Record<string, unknown>,
      version: 2,
    });
    return updated;
  }

  const created: ContactRecord = {
    id: newId(),
    personType: input.personType,
    legalName: name,
    tradeName: input.tradeName.trim(),
    types: input.types,
    cpf: input.cpf.trim(),
    cnpj: input.cnpj.trim(),
    rg: input.rg.trim(),
    phonePrimary: input.phonePrimary.trim(),
    phoneSecondary: input.phoneSecondary.trim(),
    whatsapp: input.whatsapp.trim(),
    email: input.email.trim(),
    zipCode: input.zipCode.trim(),
    street: input.street.trim(),
    number: input.number.trim(),
    complement: input.complement.trim(),
    district: input.district.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    notes: input.notes.trim(),
    pixKey: input.pixKey.trim(),
    contactPersonName: input.contactPersonName.trim(),
    active: input.active,
    createdAt: now,
    updatedAt: now,
  };
  all.push(created);
  saveJson(KEY, all);
  await enqueueSyncOp({
    entityType: 'Contact',
    entityId: created.id,
    action: 'CREATE',
    payload: created as unknown as Record<string, unknown>,
  });
  return created;
}

export async function setContactActive(id: string, active: boolean) {
  const contact = getContact(id);
  if (!contact) throw new Error('Contato não encontrado');
  return upsertContact({ ...contact, active });
}

export async function deleteContact(id: string) {
  const all = listContacts().filter((c) => c.id !== id);
  saveJson(KEY, all);
  await enqueueSyncOp({
    entityType: 'Contact',
    entityId: id,
    action: 'DELETE',
    payload: { id },
  });
}

export function emptyContactForm(): Omit<ContactRecord, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    personType: 'INDIVIDUAL',
    legalName: '',
    tradeName: '',
    types: ['CLIENT'],
    cpf: '',
    cnpj: '',
    rg: '',
    phonePrimary: '',
    phoneSecondary: '',
    whatsapp: '',
    email: '',
    zipCode: '',
    street: '',
    number: '',
    complement: '',
    district: '',
    city: '',
    state: '',
    notes: '',
    pixKey: '',
    contactPersonName: '',
    active: true,
  };
}
