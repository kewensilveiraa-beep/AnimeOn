import {
  createAdminSupabase,
  logApiError,
  requireAdmin,
  readDashboardMetrics,
  sendJson,
} from '../_lib/admin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }
  if (!requireAdmin(req, res)) return;

  try {
    const supabase = createAdminSupabase();
    const [metrics, movementsResult] = await Promise.all([
      readDashboardMetrics(supabase),
      supabase
        .from('movimentacoes_financeiras')
        .select('id,tipo,descricao,valor,created_at')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    if (movementsResult.error) throw movementsResult.error;
    return sendJson(res, 200, { metrics, movements: movementsResult.data || [] });
  } catch (error) {
    logApiError('Falha ao carregar métricas', error);
    return sendJson(res, 500, {
      error: 'Não foi possível carregar o painel. Confirme as variáveis da Vercel e execute supabase/schema.sql.',
    });
  }
}
