import {
  createAdminSupabase,
  createSessionCookie,
  getLoginIpHash,
  getRequestBody,
  logApiError,
  requestIsSameOrigin,
  sendJson,
  verifyAdminPin,
} from '../_lib/admin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }
  if (!requestIsSameOrigin(req)) return sendJson(res, 403, { error: 'Origem não autorizada.' });

  let body;
  try {
    body = getRequestBody(req);
  } catch {
    return sendJson(res, 400, { error: 'Corpo da requisição inválido.' });
  }
  const pin = typeof body.pin === 'string' ? body.pin : '';
  const configuredPin = process.env.ADMIN_PIN;
  if (!configuredPin || configuredPin.length < 8 || !process.env.ADMIN_SESSION_SECRET) {
    return sendJson(res, 503, {
      error: 'Configure ADMIN_PIN com pelo menos 8 caracteres e ADMIN_SESSION_SECRET na Vercel.',
    });
  }
  if (pin.length === 0 || pin.length > 128) {
    return sendJson(res, 400, { error: 'Informe um PIN válido.' });
  }

  try {
    const supabase = createAdminSupabase();
    const ipHash = getLoginIpHash(req);
    const { data: lockedUntil, error: statusError } = await supabase.rpc('admin_login_rate_limit', {
      p_ip_hash: ipHash,
      p_success: null,
    });
    if (statusError) throw statusError;
    if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
      return sendJson(res, 429, { error: 'Muitas tentativas. Tente novamente em 15 minutos.' });
    }

    const isValid = verifyAdminPin(pin, configuredPin);
    const { data: newLock, error: attemptError } = await supabase.rpc('admin_login_rate_limit', {
      p_ip_hash: ipHash,
      p_success: isValid,
    });
    if (attemptError) throw attemptError;
    if (!isValid) {
      return sendJson(res, newLock ? 429 : 401, {
        error: newLock
          ? 'Muitas tentativas. Tente novamente em 15 minutos.'
          : 'PIN incorreto.',
      });
    }

    createSessionCookie(req, res);
    return sendJson(res, 200, { authenticated: true });
  } catch (error) {
    logApiError('Falha no login administrativo', error);
    return sendJson(res, 500, {
      error: 'Não foi possível validar o login. Verifique as variáveis de servidor e execute supabase/schema.sql.',
    });
  }
}
