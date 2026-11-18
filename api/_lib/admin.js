import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SESSION_COOKIE = 'animeon_admin_session';
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

export function sendJson(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(data);
}

export function getRequestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return {};
}

export function createAdminSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor.');
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function requestIsSameOrigin(req) {
  const origin = req.headers.origin;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET precisa conter pelo menos 32 caracteres.');
  }
  return secret;
}

function signPayload(payload) {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function getCookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  const cookie = cookies.map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? cookie.slice(name.length + 1) : '';
}

function hasValidSession(req) {
  const token = getCookieValue(req, SESSION_COOKIE);
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  try {
    const expected = Buffer.from(signPayload(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(session.expiresAt) && session.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export function createSessionCookie(req, res) {
  const payload = Buffer.from(JSON.stringify({
    expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000,
  })).toString('base64url');
  const token = `${payload}.${signPayload(payload)}`;
  const isSecure = process.env.NODE_ENV === 'production'
    || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  const secure = isSecure ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION_SECONDS}${secure}`,
  );
}

export function clearSessionCookie(req, res) {
  const isSecure = process.env.NODE_ENV === 'production'
    || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  const secure = isSecure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}

export function requireAdmin(req, res) {
  if (req.method !== 'GET' && !requestIsSameOrigin(req)) {
    sendJson(res, 403, { error: 'Origem da requisição não autorizada.' });
    return false;
  }
  if (!hasValidSession(req)) {
    sendJson(res, 401, { error: 'Sessão administrativa inválida ou expirada.' });
    return false;
  }
  return true;
}

export function getLoginIpHash(req) {
  const secret = getSessionSecret();
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwardedFor || req.socket?.remoteAddress || 'unknown';
  return createHmac('sha256', secret).update(`login-ip:${ip}`).digest('hex');
}

export function verifyAdminPin(candidate, configuredPin) {
  const candidateHash = createHmac('sha256', 'animeon-admin-pin').update(candidate).digest();
  const configuredHash = createHmac('sha256', 'animeon-admin-pin').update(configuredPin).digest();
  return timingSafeEqual(candidateHash, configuredHash);
}

export function logApiError(context, error) {
  console.error(`[AnimeOn API] ${context}`, error);
}

export async function readDashboardMetrics(supabase) {
  const { data, error } = await supabase.rpc('admin_dashboard_metrics');
  if (error) throw error;
  return data;
}

export async function createFinanceMovement(supabase, { tipo, descricao, valor }) {
  const { data, error } = await supabase
    .from('movimentacoes_financeiras')
    .insert({ tipo, descricao, valor })
    .select('id,tipo,descricao,valor,created_at')
    .single();
  if (error) throw error;
  return data;
}

export function normalizeFinanceMovement(value) {
  if (!value || typeof value !== 'object') return null;
  const tipo = value.tipo === 'receita' ? 'receita' : 'despesa';
  const descricao = String(value.descricao || '').trim().slice(0, 180);
  const valor = Number(value.valor);
  if (!['receita', 'despesa'].includes(value.tipo)
    || descricao.length === 0
    || !Number.isFinite(valor)
    || valor <= 0
    || valor > 1_000_000_000) {
    return null;
  }
  return { tipo, descricao, valor };
}
