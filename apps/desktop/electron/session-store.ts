import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: {
    id: string;
    username: string;
    companyId: string;
    branchId: string | null;
    roleCode: string;
  };
  deviceId: string | null;
  deviceSecret: string | null;
  deviceName: string;
  apiBaseUrl: string;
  lastPullAt: string | null;
};

function sessionPath(): string {
  return path.join(app.getPath('userData'), 'session.json');
}

export function loadSession(): AuthSession | null {
  const p = sessionPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as AuthSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  fs.writeFileSync(sessionPath(), JSON.stringify(session, null, 2), 'utf8');
}

export function clearSession(): void {
  const p = sessionPath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function getAccessToken(): string | null {
  return loadSession()?.accessToken ?? null;
}

export function getApiBaseUrl(): string {
  return (
    loadSession()?.apiBaseUrl ??
    process.env.VITE_API_BASE_URL ??
    'http://localhost:3000/api/v1'
  );
}

export function getDeviceId(): string | null {
  return loadSession()?.deviceId ?? null;
}

export async function loginAndRegister(input: {
  apiBaseUrl: string;
  username: string;
  password: string;
  deviceName: string;
}): Promise<AuthSession> {
  const apiBase = input.apiBaseUrl.replace(/\/$/, '');

  const loginRes = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: input.username,
      password: input.password,
    }),
  });
  if (!loginRes.ok) {
    const err = (await loginRes.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `Login falhou (${loginRes.status})`);
  }
  const loginBody = (await loginRes.json()) as {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    user: AuthSession['user'];
  };

  const regRes = await fetch(`${apiBase}/devices/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginBody.accessToken}`,
    },
    body: JSON.stringify({ friendlyName: input.deviceName }),
  });
  if (!regRes.ok) {
    throw new Error(`Registro do dispositivo falhou (${regRes.status})`);
  }
  const regBody = (await regRes.json()) as {
    device: { id: string; friendlyName: string };
    deviceSecret: string;
  };

  const session: AuthSession = {
    accessToken: loginBody.accessToken,
    refreshToken: loginBody.refreshToken,
    expiresIn: loginBody.expiresIn,
    user: loginBody.user,
    deviceId: regBody.device.id,
    deviceSecret: regBody.deviceSecret,
    deviceName: input.deviceName,
    apiBaseUrl: apiBase,
    lastPullAt: null,
  };
  saveSession(session);
  return session;
}

export async function refreshAccessToken(): Promise<string | null> {
  const session = loadSession();
  if (!session?.refreshToken) return null;
  const res = await fetch(`${session.apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    user: AuthSession['user'];
  };
  saveSession({
    ...session,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    expiresIn: body.expiresIn,
    user: body.user,
  });
  return body.accessToken;
}
