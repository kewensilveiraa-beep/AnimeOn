import {
  createAdminSupabase,
  createFinanceMovement,
  getRequestBody,
  logApiError,
  normalizeFinanceMovement,
  readDashboardMetrics,
  requireAdmin,
  sendJson,
} from '../_lib/admin.js';

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function parseCurrencyNumber(value) {
  return Number(
    value.includes(',')
      ? value.replace(/\./g, '').replace(',', '.')
      : value,
  );
}

function parseFinanceCommand(message) {
  const match = message.match(/^\s*registrar\s+(receita|gasto|despesa)\s+(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(.*)$/i);
  if (!match) return null;
  const tipo = match[1].toLowerCase() === 'receita' ? 'receita' : 'despesa';
  const valor = parseCurrencyNumber(match[2]);
  const descricao = match[3].trim() || (tipo === 'receita' ? 'Receita registrada pelo chat' : 'Despesa registrada pelo chat');
  return normalizeFinanceMovement({ tipo, valor, descricao });
}

function parseGeminiResponse(payload) {
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();
  if (!text) return null;

  try {
    const result = JSON.parse(text);
    if (typeof result.reply !== 'string' || !result.reply.trim()) return null;
    return {
      reply: result.reply.trim().slice(0, 3000),
      movement: normalizeFinanceMovement(result.movement),
    };
  } catch {
    return null;
  }
}

function getExplicitMovementDetails(message) {
  const normalized = normalizeQuestion(message);
  if (!/\b(registr|lanc|adicion|inclu|anot|cadastr)/.test(normalized)) return null;

  const typeMatch = normalized.match(/\b(receita|despesa|gasto|custo)\b/);
  const amountMatch = message.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)/i);
  if (!typeMatch || !amountMatch) return null;

  const amount = parseCurrencyNumber(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    tipo: typeMatch[1] === 'receita' ? 'receita' : 'despesa',
    valor: amount,
  };
}

async function askGemini(message, context) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: [
                'Você é o analista financeiro do AnimeOn, um site de afiliados Amazon Brasil com a tag animeon09-20.',
                'Responda de forma objetiva, sempre em português, usando somente os dados fornecidos; não invente métricas nem trate cliques como vendas.',
                'Se o usuário solicitar explicitamente registrar uma receita ou despesa e informar o valor, devolva movement com tipo (receita ou despesa), valor numérico e uma descrição curta.',
                'Não proponha um lançamento quando o usuário apenas perguntar sobre receitas ou despesas. Não alegue que um lançamento foi salvo.',
                'Retorne exclusivamente JSON válido no formato {"reply":"resposta","movement":null} ou {"reply":"resposta","movement":{"tipo":"receita|despesa","valor":0,"descricao":"..."}}.',
              ].join(' '),
            }],
          },
          contents: [{
            role: 'user',
            parts: [{
              text: `Contexto atualizado do Supabase:\n${JSON.stringify(context)}\n\nMensagem do usuário:\n${message}`,
            }],
          }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini respondeu com status ${response.status}.`);
    }

    const result = parseGeminiResponse(await response.json());
    if (!result) throw new Error('Gemini retornou uma resposta em formato inválido.');
    return result;
  } catch (error) {
    logApiError('Gemini indisponível; usando o chat por regras', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeQuestion(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function makeAnswer(message, metrics, averageCommission) {
  const question = normalizeQuestion(message);
  const clicks = toNumber(metrics.totalClicks);
  const tiktokClicks = toNumber(metrics.tiktokClicks);
  const revenue = toNumber(metrics.revenue);
  const costs = toNumber(metrics.costs);
  const profit = revenue - costs;
  const roi = costs > 0 ? (profit / costs) * 100 : null;
  const epc = clicks > 0 ? revenue / clicks : 0;

  if (question.includes('roi')) {
    return roi === null
      ? 'Ainda não há custos lançados para calcular o ROI. Registre seus investimentos no painel financeiro.'
      : `O ROI atual é ${roi.toFixed(1)}%. Receita: ${formatCurrency(revenue)}; custos: ${formatCurrency(costs)}; lucro líquido: ${formatCurrency(profit)}.`;
  }

  if (question.includes('convers') || question.includes('taxa')) {
    if (revenue <= 0) return 'Aguardando vendas: ainda não há receitas financeiras lançadas para estimar a conversão.';
    if (averageCommission <= 0) return 'Informe uma comissão média por venda no painel para calcular a taxa estimada.';
    if (clicks === 0) return 'Ainda não há cliques registrados para estimar a taxa de conversão.';
    const estimatedRate = (revenue / averageCommission / clicks) * 100;
    return `Taxa de conversão estimada: ${estimatedRate.toFixed(2)}%, assumindo comissão média de ${formatCurrency(averageCommission)} por venda. Essa estimativa não substitui dados reais de conversão da Amazon.`;
  }

  if (question.includes('anime') && (question.includes('clic') || question.includes('convert'))) {
    const topAnime = metrics.topAnimes?.[0];
    return topAnime
      ? `${topAnime.animeTitulo} é o anime com mais cliques: ${topAnime.clicks}. Lembre-se: cliques não confirmam compras.`
      : 'Ainda não há cliques de afiliado registrados para comparar os animes.';
  }

  if (question.includes('tiktok')) {
    const share = clicks > 0 ? (tiktokClicks / clicks) * 100 : 0;
    const recommendation = tiktokClicks === 0
      ? 'Use links com ?utm_source=tiktok nas próximas publicações para separar esse tráfego.'
      : `TikTok representa ${share.toFixed(1)}% dos cliques (${tiktokClicks}). Compare o EPC desse tráfego com o orgânico antes de aumentar o investimento.`;
    return `${recommendation} Teste criativos e chamadas diferentes com UTMs distintas; aumente o orçamento gradualmente somente quando a receita atribuída superar os custos.`;
  }

  if (question.includes('1000') || question.includes('mil cliques') || question.includes('projet')) {
    return clicks > 0
      ? `Com o EPC atual de ${formatCurrency(epc)}, 1.000 cliques projetariam ${formatCurrency(epc * 1000)} em receita bruta. É uma projeção linear, não uma garantia de ganhos.`
      : 'Ainda não há cliques ou receita suficientes para projetar ganhos. Registre cliques e receitas para calcular o EPC.';
  }

  const topAnime = metrics.topAnimes?.[0];
  return `Resumo atual: ${clicks} cliques, ${tiktokClicks} via TikTok, ${formatCurrency(revenue)} em receitas e ${formatCurrency(costs)} em custos. EPC: ${formatCurrency(epc)}.${topAnime ? ` Anime mais clicado: ${topAnime.animeTitulo} (${topAnime.clicks}).` : ''}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }
  if (!requireAdmin(req, res)) return;

  let body;
  try {
    body = getRequestBody(req);
  } catch {
    return sendJson(res, 400, { error: 'Corpo da requisição inválido.' });
  }
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
  if (!message) return sendJson(res, 400, { error: 'Escreva uma pergunta ou comando.' });

  try {
    const supabase = createAdminSupabase();
    const movement = parseFinanceCommand(message);
    if (/^\s*registrar\s+(receita|gasto|despesa)\b/i.test(message)) {
      if (!movement) {
        return sendJson(res, 400, { error: 'Use: registrar receita 150 comissão Amazon ou registrar gasto 50 TikTok Ads.' });
      }
      const saved = await createFinanceMovement(supabase, movement);
      const metrics = await readDashboardMetrics(supabase);
      return sendJson(res, 200, {
        movementRegistered: true,
        movement: saved,
        reply: `${movement.tipo === 'receita' ? 'Receita' : 'Despesa'} de ${formatCurrency(movement.valor)} registrada: ${movement.descricao}. Os indicadores já foram atualizados.`,
        metrics,
      });
    }

    const metrics = await readDashboardMetrics(supabase);
    const averageCommission = Number(body.averageCommission);
    const safeAverageCommission = Number.isFinite(averageCommission) && averageCommission > 0
      ? averageCommission
      : 0;
    const context = {
      totalClicks: toNumber(metrics.totalClicks),
      tiktokClicks: toNumber(metrics.tiktokClicks),
      topAnimes: metrics.topAnimes || [],
      revenue: toNumber(metrics.revenue),
      expenses: toNumber(metrics.costs),
      balance: toNumber(metrics.revenue) - toNumber(metrics.costs),
      averageCommission: safeAverageCommission,
    };
    const geminiAnswer = await askGemini(message, context);
    if (geminiAnswer) {
      const requestedMovement = getExplicitMovementDetails(message);
      const suggestedMovement = geminiAnswer.movement;
      if (requestedMovement
        && suggestedMovement
        && suggestedMovement.tipo === requestedMovement.tipo
        && suggestedMovement.valor === requestedMovement.valor) {
        const saved = await createFinanceMovement(supabase, suggestedMovement);
        const updatedMetrics = await readDashboardMetrics(supabase);
        return sendJson(res, 200, {
          movementRegistered: true,
          movement: saved,
          reply: `${suggestedMovement.tipo === 'receita' ? 'Receita' : 'Despesa'} de ${formatCurrency(suggestedMovement.valor)} registrada: ${suggestedMovement.descricao}. Os indicadores já foram atualizados.`,
          metrics: updatedMetrics,
        });
      }

      return sendJson(res, 200, {
        movementRegistered: false,
        reply: geminiAnswer.reply,
      });
    }

    return sendJson(res, 200, {
      movementRegistered: false,
      reply: makeAnswer(message, metrics, safeAverageCommission),
    });
  } catch (error) {
    logApiError('Falha no chat financeiro', error);
    return sendJson(res, 500, { error: 'Não foi possível consultar os dados financeiros.' });
  }
}
