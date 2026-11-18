# AnimeOn

Agregador de descoberta e rastreamento de animes construído com React e Vite.
O catálogo, as temporadas, a busca e os metadados vêm da API GraphQL pública
da AniList (`https://graphql.anilist.co`).

## Recursos

- Carrossel com até cinco destaques, troca automática a cada 12 segundos,
  trailers do YouTube e controles manuais.
- Destaques baseados no ranking dinâmico `TRENDING_DESC` da AniList, atualizados
  ao carregar o catálogo e a cada 24 horas; independentes da categoria
  selecionada e não representam visualizações dos usuários do AnimeOn.
- Catálogo por categoria, busca com debounce e paginação progressiva de 30
  títulos por lote.
- Lista pessoal e progresso de episódios persistidos no `localStorage`.
- Detalhes, trailer do YouTube, links afiliados da Amazon Brasil e
  rastreamento de cliques por anime e origem.
- O app não transmite episódios completos. O rastreador registra o progresso;
  trailers e links oficiais são recursos separados.

## Executar localmente

```sh
npm install
npm run dev
```

## Links de parceiros

As URLs e identificadores ficam centralizados em `src/config/afiliados.js`.
A Amazon Brasil usa a tag aprovada `animeon09-20` nos links da Crunchyroll via
Prime Video Channels, do Prime Video e da loja de mangás e colecionáveis.

## Supabase e painel administrativo

1. Copie `.env.example` para `.env.local` para desenvolvimento local. O
   `.env.local` já está ignorado pelo Git; nunca versione chaves privadas.
2. No SQL Editor do Supabase, execute `supabase/schema.sql`. A tabela de cliques
   permite `INSERT` anônimo validado pela tag, mas não permite leitura ou edição
   pública. Dados financeiros e métricas são acessíveis somente pelas funções
   de servidor.
3. Na Vercel, configure estas variáveis em todos os ambientes usados:

   - `VITE_SUPABASE_URL`: URL do projeto Supabase.
   - `VITE_SUPABASE_ANON_KEY`: chave publishable/anon do projeto.
   - `ADMIN_PIN`: PIN administrativo forte, definido apenas no servidor.
   - `ADMIN_SESSION_SECRET`: segredo aleatório com pelo menos 32 caracteres.
   - `SUPABASE_SERVICE_ROLE_KEY`: chave service role, somente no servidor.
   - `GEMINI_API_KEY`: chave da API Gemini, somente no servidor; sem ela ou se a API estiver indisponível, o chat usa as respostas locais por regras.

   Gere o segredo de sessão com
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
   Não use o prefixo `VITE_` em `ADMIN_PIN`, `ADMIN_SESSION_SECRET` ou
   `SUPABASE_SERVICE_ROLE_KEY`; ele exporia esses valores ao navegador.
4. Faça um novo deploy da Vercel. O painel fica em `/admin`. Para testar as
   funções serverless localmente, use `vercel dev`; `npm run dev` inicia apenas
   o servidor Vite.

O painel atualiza as métricas a cada 20 segundos. O chat usa o Gemini para
analisar os dados atualizados do Supabase e mantém respostas locais por regras
como fallback. A taxa de conversão é uma estimativa com base na receita
registrada, cliques e comissão média informada, não um dado real de conversão
fornecido pela Amazon.
