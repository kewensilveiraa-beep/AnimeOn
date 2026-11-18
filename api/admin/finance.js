import {
  createAdminSupabase,
  createFinanceMovement,
  getRequestBody,
  logApiError,
  normalizeFinanceMovement,
  requireAdmin,
  sendJson,
} from '../_lib/admin.js';

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }
  if (!requireAdmin(req, res)) return;

  try {
    const supabase = createAdminSupabase();
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('movimentacoes_financeiras')
        .select('id,tipo,descricao,valor,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return sendJson(res, 200, { movements: data || [] });
    }

    let body;
    try {
      body = getRequestBody(req);
    } catch {
      return sendJson(res, 400, { error: 'Corpo da requisição inválido.' });
    }

    if (req.method === 'POST') {
      const movement = normalizeFinanceMovement(body);
      if (!movement) {
        return sendJson(res, 400, { error: 'Informe tipo, descrição e valor positivo válidos.' });
      }
      const data = await createFinanceMovement(supabase, movement);
      return sendJson(res, 201, { movement: data });
    }

    if (typeof body.id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) {
      return sendJson(res, 400, { error: 'Identificador de lançamento inválido.' });
    }
    const { error } = await supabase.from('movimentacoes_financeiras').delete().eq('id', body.id);
    if (error) throw error;
    return sendJson(res, 200, { deleted: true });
  } catch (error) {
    logApiError('Falha nas movimentações financeiras', error);
    return sendJson(res, 500, { error: 'Não foi possível salvar ou remover o lançamento financeiro.' });
  }
}
