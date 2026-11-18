import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './AdminPanel.css';

const CHAT_SUGGESTIONS = [
  'Qual meu ROI atual?',
  'Qual anime está convertendo mais?',
  'Como aumentar minhas vendas no TikTok?',
  'Projetar ganhos com 1.000 cliques',
];

const LINK_LABELS = {
  manga: 'Mangás',
  crunchyroll: 'Crunchyroll',
  prime_video: 'Prime Video',
};

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(Number(value) || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

async function requestApi(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error(`Não foi possível conectar à API administrativa: ${error.message}`);
  }

  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  if (!response.ok) {
    const error = new Error(result.error || `A API respondeu com status ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return result;
}

function MetricCard({ label, value, note, accent }) {
  return (
    <article className={`admin-metric-card ${accent || ''}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

function ChatBubble({ message }) {
  return (
    <div className={`admin-chat-message ${message.role}`}>
      <span>{message.role === 'assistant' ? 'AnimeOn Financeiro' : 'Você'}</span>
      <p>{message.content}</p>
    </div>
  );
}

export default function AdminPanel() {
  const [authStatus, setAuthStatus] = useState('checking');
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [dashboardError, setDashboardError] = useState('');
  const [loading, setLoading] = useState(true);
  const [movementType, setMovementType] = useState('receita');
  const [movementDescription, setMovementDescription] = useState('');
  const [movementAmount, setMovementAmount] = useState('');
  const [savingMovement, setSavingMovement] = useState(false);
  const [averageCommission, setAverageCommission] = useState(
    () => window.localStorage.getItem('animeon_admin_average_commission') || '',
  );
  const [chatMessages, setChatMessages] = useState([{
    role: 'assistant',
    content: 'Olá! Posso resumir seu ROI, cliques, animes mais acessados ou registrar uma receita/despesa.',
  }]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const chatEndRef = useRef(null);

  const refreshDashboard = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await requestApi('/api/admin/metrics');
      setDashboard(result);
      setDashboardError('');
      setAuthStatus('authenticated');
    } catch (error) {
      if (error.status === 401) {
        setAuthStatus('unauthenticated');
      } else {
        setDashboardError(error.message);
        setAuthStatus((current) => (current === 'checking' ? 'error' : current));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void refreshDashboard({ quiet: true });
    });
    return () => {
      active = false;
    };
  }, [refreshDashboard]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return undefined;
    const interval = window.setInterval(() => refreshDashboard({ quiet: true }), 20000);
    return () => window.clearInterval(interval);
  }, [authStatus, refreshDashboard]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [chatMessages, chatBusy]);

  const metrics = dashboard?.metrics || {};
  const revenue = Number(metrics.revenue) || 0;
  const costs = Number(metrics.costs) || 0;
  const profit = revenue - costs;
  const totalClicks = Number(metrics.totalClicks) || 0;
  const epc = totalClicks > 0 ? revenue / totalClicks : 0;
  const roi = costs > 0 ? (profit / costs) * 100 : null;
  const commissionValue = Number(averageCommission.replace(',', '.')) || 0;
  const estimatedConversionRate = useMemo(() => {
    if (revenue <= 0) return { label: 'Aguardando vendas', value: null };
    if (commissionValue <= 0 || totalClicks <= 0) {
      return { label: 'Informe a comissão média', value: null };
    }
    return {
      label: 'Estimativa',
      value: (revenue / commissionValue / totalClicks) * 100,
    };
  }, [commissionValue, revenue, totalClicks]);

  const clickTypes = Object.entries(metrics.clicksByType || {})
    .map(([type, count]) => ({ type, count: Number(count) || 0 }))
    .sort((left, right) => right.count - left.count);
  const maxTypeClicks = Math.max(1, ...clickTypes.map((entry) => entry.count));

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError('');
    try {
      await requestApi('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      window.sessionStorage.setItem('animeon_admin_session', 'active');
      setPin('');
      setAuthStatus('authenticated');
      await refreshDashboard();
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setDashboardError('');
    try {
      await requestApi('/api/admin/logout', { method: 'POST' });
      window.sessionStorage.removeItem('animeon_admin_session');
      setDashboard(null);
      setAuthStatus('unauthenticated');
      setChatMessages([{
        role: 'assistant',
        content: 'Sessão encerrada. Entre novamente para acessar o painel.',
      }]);
    } catch (error) {
      setDashboardError(error.message);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleMovementSubmit = async (event) => {
    event.preventDefault();
    setSavingMovement(true);
    setDashboardError('');
    try {
      await requestApi('/api/admin/finance', {
        method: 'POST',
        body: JSON.stringify({
          tipo: movementType,
          descricao: movementDescription,
          valor: Number(movementAmount.replace(',', '.')),
        }),
      });
      setMovementDescription('');
      setMovementAmount('');
      await refreshDashboard({ quiet: true });
    } catch (error) {
      setDashboardError(error.message);
    } finally {
      setSavingMovement(false);
    }
  };

  const handleDeleteMovement = async (id) => {
    setDashboardError('');
    try {
      await requestApi('/api/admin/finance', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });
      await refreshDashboard({ quiet: true });
    } catch (error) {
      setDashboardError(error.message);
    }
  };

  const sendChatMessage = async (value) => {
    const message = value.trim();
    if (!message || chatBusy) return;
    setChatMessages((current) => [...current, { role: 'user', content: message }]);
    setChatInput('');
    setChatError('');
    setChatBusy(true);
    try {
      const result = await requestApi('/api/admin/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          averageCommission: commissionValue,
        }),
      });
      setChatMessages((current) => [...current, { role: 'assistant', content: result.reply }]);
      if (result.movementRegistered) await refreshDashboard({ quiet: true });
    } catch (error) {
      setChatError(error.message);
    } finally {
      setChatBusy(false);
    }
  };

  const handleChatSubmit = (event) => {
    event.preventDefault();
    sendChatMessage(chatInput);
  };

  const updateAverageCommission = (value) => {
    setAverageCommission(value);
    window.localStorage.setItem('animeon_admin_average_commission', value);
  };

  if (authStatus === 'checking' || (authStatus === 'error' && !dashboard)) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-card">
          <p className="admin-eyebrow">AnimeOn · área restrita</p>
          <h1>{authStatus === 'checking' ? 'Verificando sessão…' : 'Painel indisponível'}</h1>
          {dashboardError && <p className="admin-error" role="alert">{dashboardError}</p>}
          {authStatus === 'error' && (
            <button className="admin-button primary" onClick={() => refreshDashboard()}>
              Tentar novamente
            </button>
          )}
        </section>
      </main>
    );
  }

  if (authStatus !== 'authenticated') {
    return (
      <main className="admin-login-page">
        <form className="admin-login-card" onSubmit={handleLogin}>
          <a className="admin-back-link" href="/">← Voltar ao AnimeOn</a>
          <p className="admin-eyebrow">AnimeOn · área restrita</p>
          <h1>Painel administrativo</h1>
          <p className="admin-login-description">
            Entre com o PIN administrativo para consultar métricas e movimentações.
          </p>
          <label htmlFor="admin-pin">PIN</label>
          <input
            id="admin-pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            required
            maxLength={128}
          />
          {loginError && <p className="admin-error" role="alert">{loginError}</p>}
          <button className="admin-button primary" type="submit" disabled={loginBusy}>
            {loginBusy ? 'Validando…' : 'Entrar'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <a className="admin-back-link" href="/">← Voltar ao AnimeOn</a>
          <p className="admin-eyebrow">AnimeOn · visão financeira</p>
          <h1>Painel Administrativo</h1>
        </div>
        <div className="admin-header-actions">
          <span className="admin-live-indicator">Atualização a cada 20s</span>
          <button
            className="admin-button secondary"
            onClick={() => refreshDashboard()}
            disabled={loading}
          >
            {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
          <button
            className="admin-button secondary"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Saindo…' : 'Sair'}
          </button>
        </div>
      </header>

      {dashboardError && <p className="admin-error admin-page-error" role="alert">{dashboardError}</p>}

      <section className="admin-metrics-grid" aria-label="Métricas financeiras">
        <MetricCard label="Total de Cliques" value={formatNumber(totalClicks)} note="Todos os canais rastreados" />
        <MetricCard label="Cliques via TikTok" value={formatNumber(metrics.tiktokClicks)} note="Origem atribuída por UTM" />
        <MetricCard label="Receita Total" value={formatCurrency(revenue)} note={`EPC: ${formatCurrency(epc)}`} accent="income" />
        <MetricCard label="Investimento / Custos" value={formatCurrency(costs)} note="Despesas lançadas" accent="expense" />
        <MetricCard
          label="Lucro Líquido + ROI"
          value={formatCurrency(profit)}
          note={`ROI: ${roi === null ? 'sem custos lançados' : `${roi.toFixed(1)}%`}`}
          accent={profit >= 0 ? 'income' : 'expense'}
        />
      </section>

      <section className="admin-analysis-grid">
        <article className="admin-card">
          <div className="admin-card-heading">
            <div>
              <p className="admin-eyebrow">Atribuição</p>
              <h2>Cliques por canal</h2>
            </div>
          </div>
          <div className="admin-bars">
            {['manga', 'crunchyroll', 'prime_video'].map((type) => {
              const count = Number(metrics.clicksByType?.[type]) || 0;
              return (
                <div className="admin-bar-row" key={type}>
                  <div className="admin-bar-label">
                    <span>{LINK_LABELS[type]}</span>
                    <strong>{formatNumber(count)}</strong>
                  </div>
                  <div className="admin-bar-track">
                    <span style={{ width: `${(count / maxTypeClicks) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="admin-card">
          <div className="admin-card-heading">
            <div>
              <p className="admin-eyebrow">Engajamento</p>
              <h2>Top 5 animes mais clicados</h2>
            </div>
          </div>
          {metrics.topAnimes?.length ? (
            <ol className="admin-top-list">
              {metrics.topAnimes.map((anime, index) => (
                <li key={`${anime.animeTitulo}-${index}`}>
                  <span className="admin-rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className="admin-top-title">{anime.animeTitulo}</span>
                  <strong>{formatNumber(anime.clicks)}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="admin-empty">Os animes aparecerão aqui após os primeiros cliques.</p>
          )}
        </article>
      </section>

      <section className="admin-analysis-grid">
        <article className="admin-card">
          <div className="admin-card-heading">
            <div>
              <p className="admin-eyebrow">Lançamento rápido</p>
              <h2>Movimentação financeira</h2>
            </div>
          </div>
          <form className="admin-finance-form" onSubmit={handleMovementSubmit}>
            <label>
              Tipo
              <select value={movementType} onChange={(event) => setMovementType(event.target.value)}>
                <option value="receita">Entrada · Receita</option>
                <option value="despesa">Saída · Despesa</option>
              </select>
            </label>
            <label>
              Descrição
              <input
                value={movementDescription}
                onChange={(event) => setMovementDescription(event.target.value)}
                placeholder="Comissão Amazon Associados - Novembro"
                maxLength={180}
                required
              />
            </label>
            <label>
              Valor (R$)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={movementAmount}
                onChange={(event) => setMovementAmount(event.target.value)}
                placeholder="150,00"
                required
              />
            </label>
            <button className="admin-button primary" type="submit" disabled={savingMovement}>
              {savingMovement ? 'Salvando…' : 'Registrar lançamento'}
            </button>
          </form>

          <div className="admin-history">
            <h3>Histórico recente</h3>
            {dashboard?.movements?.length ? dashboard.movements.map((movement) => (
              <div className="admin-movement-row" key={movement.id}>
                <div>
                  <span className={`admin-movement-type ${movement.tipo}`}>
                    {movement.tipo === 'receita' ? 'Entrada' : 'Saída'}
                  </span>
                  <strong>{movement.descricao}</strong>
                  <small>{new Date(movement.created_at).toLocaleString('pt-BR')}</small>
                </div>
                <strong className={movement.tipo === 'receita' ? 'income-text' : 'expense-text'}>
                  {formatCurrency(movement.valor)}
                </strong>
                <button
                  className="admin-delete-button"
                  type="button"
                  aria-label={`Excluir ${movement.descricao}`}
                  onClick={() => handleDeleteMovement(movement.id)}
                >
                  Excluir
                </button>
              </div>
            )) : (
              <p className="admin-empty">Nenhum lançamento financeiro registrado.</p>
            )}
          </div>
        </article>

        <article className="admin-card admin-conversion-card">
          <div className="admin-card-heading">
            <div>
              <p className="admin-eyebrow">Estimativa</p>
              <h2>Taxa de conversão estimada</h2>
            </div>
            <strong className="admin-conversion-value">
              {estimatedConversionRate.value === null
                ? estimatedConversionRate.label
                : `${estimatedConversionRate.value.toFixed(2)}%`}
            </strong>
          </div>
          <p className="admin-muted">
            A estimativa usa receita registrada, cliques e a comissão média informada. Não equivale à conversão real da Amazon.
          </p>
          <label className="admin-commission-input">
            Comissão média por venda (R$)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={averageCommission}
              onChange={(event) => updateAverageCommission(event.target.value)}
              placeholder="Ex.: 8,50"
            />
          </label>
          <div className="admin-estimate-formula">
            <span>EPC atual</span>
            <strong>{formatCurrency(epc)}</strong>
          </div>
        </article>
      </section>

      <section className="admin-card admin-chat-card">
        <div className="admin-card-heading">
          <div>
            <p className="admin-eyebrow">Dados do Supabase · respostas baseadas nos indicadores</p>
            <h2>Chat Financeiro Inteligente</h2>
          </div>
        </div>
        <div className="admin-chat-suggestions">
          {CHAT_SUGGESTIONS.map((suggestion) => (
            <button
              className="admin-suggestion"
              key={suggestion}
              type="button"
              onClick={() => sendChatMessage(suggestion)}
              disabled={chatBusy}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <div className="admin-chat-log" aria-live="polite">
          {chatMessages.map((message, index) => (
            <ChatBubble key={`${message.role}-${index}`} message={message} />
          ))}
          {chatBusy && <p className="admin-chat-loading">Consultando os dados…</p>}
          <div ref={chatEndRef} />
        </div>
        {chatError && <p className="admin-error" role="alert">{chatError}</p>}
        <form className="admin-chat-form" onSubmit={handleChatSubmit}>
          <input
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="Pergunte ou digite: registrar receita 150 comissão Amazon"
            aria-label="Mensagem para o chat financeiro"
            maxLength={500}
            disabled={chatBusy}
          />
          <button className="admin-button primary" type="submit" disabled={chatBusy || !chatInput.trim()}>
            Enviar
          </button>
        </form>
      </section>
    </main>
  );
}
