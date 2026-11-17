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
- Detalhes, trailer do YouTube, serviços oficiais informados pela AniList e
  busca de produtos na Amazon Brasil.
- O app não transmite episódios completos. O rastreador registra o progresso;
  trailers e links oficiais são recursos separados.

## Executar localmente

```sh
npm install
npm run dev
```

## Links de parceiros

As URLs e identificadores ficam centralizados em `src/config/afiliados.js`.
Os valores `animeon-20` são placeholders: substitua-os pelas tags aprovadas
antes de publicar links de afiliados. A base da Crunchyroll também pode ser
substituída por um deep link de parceiro quando disponível.
