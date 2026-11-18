import {
  clearSessionCookie,
  requestIsSameOrigin,
  sendJson,
} from '../_lib/admin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }
  if (!requestIsSameOrigin(req)) return sendJson(res, 403, { error: 'Origem não autorizada.' });

  clearSessionCookie(req, res);
  return sendJson(res, 200, { authenticated: false });
}
