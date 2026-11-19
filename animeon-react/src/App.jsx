import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getLinkAmazonManga,
  getLinkCrunchyroll,
  getLinkPrimeVideo,
} from './config/afiliados.js';
import AdminPanel from './AdminPanel.jsx';
import { registrarCliqueAfiliado } from './lib/supabase.js';
import './App.css';

const ANILIST_API = 'https://graphql.anilist.co';
const API_TIMEOUT_MS = 15000;
const CATEGORIES = [
  { id: 'trending', label: 'Em Alta Agora', sort: ['TRENDING_DESC'] },
  { id: 'season', label: 'Temporada Atual', sort: ['POPULARITY_DESC'] },
  { id: 'popular', label: 'Mais Populares', sort: ['POPULARITY_DESC'] },
  { id: 'top', label: 'Melhores Avaliados', sort: ['SCORE_DESC'] },
  { id: 'upcoming', label: 'Em Breve', sort: ['POPULARITY_DESC'] },
];

function trackAffiliateClick(click) {
  void registrarCliqueAfiliado(click).catch((error) => {
    console.error('Não foi possível registrar o clique de afiliado.', error);
  });
}

function isAdminRoute() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const hashRoute = window.location.hash.replace(/^#/, '').replace(/\/+$/, '');
  return pathname === '/admin' || hashRoute === '/admin';
}

function captureTrafficOrigin() {
  const params = new URLSearchParams(window.location.search);
  const queryOrigin = params.get('utm_source') || params.get('ref');
  const existingOrigin = window.sessionStorage.getItem('origem_trafego');
  const origin = (queryOrigin || existingOrigin || 'direto')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 100) || 'direto';
  window.sessionStorage.setItem('origem_trafego', origin);
}

const ANILIST_QUERY = `
  query (
    $page: Int,
    $perPage: Int,
    $search: String,
    $sort: [MediaSort],
    $season: MediaSeason,
    $seasonYear: Int,
    $status: MediaStatus
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
      }
      media(
        type: ANIME,
        isAdult: false,
        search: $search,
        sort: $sort,
        season: $season,
        seasonYear: $seasonYear,
        status: $status
      ) {
        id
        title {
          userPreferred
          english
          romaji
          native
        }
        bannerImage
        coverImage {
          extraLarge
          large
          medium
        }
        averageScore
        episodes
        duration
        status
        format
        seasonYear
        startDate {
          year
        }
        genres
        description(asHtml: false)
        nextAiringEpisode {
          episode
          airingAt
          timeUntilAiring
        }
        studios(isMain: true) {
          nodes {
            name
          }
        }
        trailer {
          id
          site
        }
      }
    }
  }
`;

const ICONS = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8 6 4-6 4z" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </>
  ),
  bookmark: (
    <>
      <path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.75L6 21z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m18 6-12 12M6 6l12 12" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="m20 4-9 9" />
      <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </>
  ),
  star: (
    <path d="m12 3 2.8 5.67 6.26.91-4.53 4.42 1.07 6.23L12 17.29l-5.6 2.94 1.07-6.23L2.94 9.58l6.26-.91z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
    </>
  ),
  volume: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  volumeMuted: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="m16 9 5 6m0-6-5 6" />
    </>
  ),
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
};

function Icon({ name, size = 18, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name] || ICONS.film}
    </svg>
  );
}

function getAnimeTitle(anime) {
  if (typeof anime?.title === 'string') return anime.title;
  return anime?.title?.userPreferred
    || anime?.title?.english
    || anime?.title?.romaji
    || anime?.title?.native
    || 'Título indisponível';
}

function getCover(anime) {
  return anime?.coverImage?.extraLarge
    || anime?.coverImage?.large
    || anime?.coverImage?.medium
    || '';
}

function normalizeSavedAnime(anime) {
  if (anime?.coverImage) return anime;

  const legacyImage = anime?.images?.jpg?.large_image_url || anime?.images?.jpg?.image_url || '';
  const title = getAnimeTitle(anime);
  return {
    ...anime,
    id: anime?.id ?? (anime?.mal_id != null ? `legacy-${anime.mal_id}` : 'legacy-unknown'),
    title: { userPreferred: title, english: title, romaji: title },
    bannerImage: anime?.bannerImage || legacyImage,
    coverImage: { extraLarge: legacyImage, large: legacyImage, medium: legacyImage },
    averageScore: anime?.averageScore ?? (anime?.score ? Math.round(anime.score * 10) : null),
    startDate: anime?.startDate || { year: anime?.year || null },
    description: anime?.description || anime?.synopsis || '',
    genres: (anime?.genres || []).map((genre) => (typeof genre === 'string' ? genre : genre.name)),
    studios: anime?.studios || { nodes: [] },
    duration: anime?.duration || 24,
  };
}

function readSavedList() {
  const stored = localStorage.getItem('animeon_saved_list')
    ?? localStorage.getItem('animeon_favoritos')
    ?? '[]';
  const parsed = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed.map(normalizeSavedAnime) : [];
}

function readEpisodeProgress() {
  const current = localStorage.getItem('animeon_episode_progress');
  if (current) return JSON.parse(current);

  const legacy = JSON.parse(localStorage.getItem('animeon_vistos') || '{}');
  const progress = {};
  Object.entries(legacy).forEach(([key, watched]) => {
    const separator = key.lastIndexOf('-');
    const episode = Number(key.slice(separator + 1));
    if (!watched || separator < 1 || !Number.isInteger(episode)) return;

    const animeId = key.slice(0, separator);
    progress[animeId] ||= { watched: [], duration: 24 };
    progress[animeId].watched.push(episode);
  });
  return progress;
}

function getSeasonDate(date) {
  const seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
  return {
    season: seasons[Math.floor(date.getMonth() / 3)],
    seasonYear: date.getFullYear(),
  };
}

function getCategoryVariables(category, search, page = 1) {
  const variables = { page, perPage: 30 };

  if (category === 'search') {
    return { ...variables, search, sort: ['SEARCH_MATCH'] };
  }

  const currentCategory = CATEGORIES.find((item) => item.id === category) || CATEGORIES[0];
  if (category === 'season') {
    return {
      ...variables,
      ...getSeasonDate(new Date()),
      status: 'RELEASING',
      sort: currentCategory.sort,
    };
  }
  if (category === 'upcoming') {
    return { ...variables, status: 'NOT_YET_RELEASED', sort: currentCategory.sort };
  }
  return { ...variables, sort: currentCategory.sort };
}

async function fetchAniList(variables, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const abortRequest = () => controller.abort();
  externalSignal?.addEventListener('abort', abortRequest, { once: true });

  try {
    const response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query: ANILIST_QUERY, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('A AniList limitou as consultas. Aguarde um pouco e tente novamente.');
      }
      throw new Error(`A AniList respondeu com erro HTTP ${response.status}.`);
    }

    const result = await response.json();
    if (result.errors?.length) {
      throw new Error(result.errors[0].message || 'A AniList não conseguiu processar a consulta.');
    }
    const page = result.data?.Page;
    if (!page) throw new Error('A AniList retornou uma resposta sem resultados de catálogo.');
    return {
      media: page.media || [],
      pageInfo: page.pageInfo || { currentPage: variables.page, hasNextPage: false },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('A consulta excedeu o tempo limite. Tente novamente.');
    }
    if (error instanceof TypeError) {
      throw new Error('Não foi possível conectar à AniList. Verifique sua conexão.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortRequest);
  }
}

function stripHtml(value = '') {
  const documentValue = new DOMParser().parseFromString(value, 'text/html');
  return documentValue.body.textContent?.trim() || '';
}

function getReleasedEpisodeCount(anime) {
  const planned = Number(anime?.episodes) || 0;
  const nextEpisode = Number(anime?.nextAiringEpisode?.episode);
  if (anime?.status === 'RELEASING' && nextEpisode > 0) {
    return Math.max(0, Math.min(planned || nextEpisode - 1, nextEpisode - 1));
  }
  return planned;
}

function formatCountdown(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const remaining = Math.max(0, seconds);
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}min`;
}

function AnimeCard({ anime, progress, isSaved, onOpen, onToggleSaved }) {
  const id = String(anime.id);
  const watched = progress[id]?.watched || [];
  const total = getReleasedEpisodeCount(anime);
  const percentage = total > 0 ? Math.min(100, Math.round((watched.length / total) * 100)) : 0;
  const countdown = anime.nextAiringEpisode && anime.status === 'RELEASING'
    ? formatCountdown(anime.nextAiringEpisode.timeUntilAiring)
    : '';

  return (
    <article className="anime-card">
      <button className="poster-button" onClick={() => onOpen(anime)} aria-label={`Detalhes de ${getAnimeTitle(anime)}`}>
        <img className="poster-image" src={getCover(anime)} alt="" loading="lazy" />
        <span className="rating-badge">
          <Icon name="star" size={14} />
          {anime.averageScore ? (anime.averageScore / 10).toFixed(1) : '—'}
        </span>
        {countdown && (
          <span className="airing-badge">
            Ep. {anime.nextAiringEpisode.episode} em {countdown}
          </span>
        )}
        {percentage > 0 && (
          <span className="card-progress" aria-label={`${percentage}% assistido`}>
            <span style={{ width: `${percentage}%` }} />
          </span>
        )}
      </button>
      <div className="card-information">
        <div>
          <h3>{getAnimeTitle(anime)}</h3>
          <p>
            {anime.startDate?.year || anime.seasonYear || 'Ano não informado'}
            {anime.episodes ? ` · ${anime.episodes} episódios` : ''}
          </p>
        </div>
        <button
          className={`icon-button save-button ${isSaved ? 'is-saved' : ''}`}
          onClick={() => onToggleSaved(anime)}
          aria-label={isSaved ? `Remover ${getAnimeTitle(anime)} da lista` : `Salvar ${getAnimeTitle(anime)}`}
          title={isSaved ? 'Remover da Minha Lista' : 'Adicionar à Minha Lista'}
        >
          <Icon name={isSaved ? 'check' : 'plus'} />
        </button>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton-poster skeleton" />
      <div className="skeleton-copy">
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line short" />
      </div>
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <>
      <section className="hero hero-skeleton skeleton" aria-label="Carregando destaque" />
      <div className="skeleton-section">
        <div className="skeleton skeleton-line section-line" />
        <div className="anime-grid">
          {Array.from({ length: 8 }, (_, index) => <SkeletonCard key={index} />)}
        </div>
      </div>
    </>
  );
}

function FeaturedHero({ animes, savedIds, trendingError, onOpen, onToggleSaved }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const anime = animes[activeIndex] || animes[0];

  useEffect(() => {
    if (animes.length < 2 || isHovered || !isMuted) return undefined;

    const timer = setInterval(() => {
      setVideoReady(false);
      setActiveIndex((current) => (current + 1) % animes.length);
    }, 12000);

    return () => clearInterval(timer);
  }, [activeIndex, animes.length, isHovered, isMuted]);

  if (!anime) return null;

  const image = anime.bannerImage || getCover(anime);
  const synopsis = stripHtml(anime.description || '');
  const title = getAnimeTitle(anime);
  const trailerId = anime.trailer?.site?.toLowerCase() === 'youtube' ? anime.trailer.id : null;
  const trailerUrl = trailerId
    ? `https://www.youtube.com/embed/${encodeURIComponent(trailerId)}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&loop=1&playlist=${encodeURIComponent(trailerId)}&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3`
    : null;
  const selectSlide = (index) => {
    setVideoReady(false);
    setActiveIndex(index);
  };
  const paused = isHovered || !isMuted;

  return (
    <section
      className={`hero hero-carousel ${isHovered ? 'is-hovered' : ''}`}
      style={image ? { backgroundImage: `url("${image}")` } : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {trailerUrl && (
        <>
          <div className="hero-video-frame">
            <iframe
              key={`${anime.id}-${isMuted ? 'muted' : 'sound'}`}
              src={trailerUrl}
              title={`Mini trailer de ${title}`}
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              tabIndex="-1"
              onLoad={() => setVideoReady(true)}
            />
          </div>
          <div
            className={`hero-video-poster ${videoReady ? 'is-hidden' : ''}`}
            style={{ backgroundImage: `url("${image}")` }}
            aria-hidden="true"
          />
        </>
      )}
      <div className="hero-content">
        <span className="eyebrow">
          <span className="eyebrow-mark" />
          Destaque {String(activeIndex + 1).padStart(2, '0')}
        </span>
        {trendingError && (
          <p className="hero-update-status" role="status">
            {trendingError}
          </p>
        )}
        <h1>{title}</h1>
        <div className="hero-meta">
          {anime.averageScore && (
            <span className="hero-score">
              <Icon name="star" size={16} />
              {(anime.averageScore / 10).toFixed(1)}
            </span>
          )}
          {anime.seasonYear && <span>{anime.seasonYear}</span>}
          {anime.format && <span>{anime.format.replaceAll('_', ' ')}</span>}
        </div>
        <p className="hero-synopsis">{synopsis || 'Sinopse indisponível.'}</p>
        <div className="hero-actions">
          <button className="button-primary" onClick={() => onOpen(anime)}>
            <Icon name="play" />
            Ver detalhes e episódios
          </button>
          <button className="button-secondary" onClick={() => onToggleSaved(anime)}>
            <Icon name={savedIds.has(String(anime.id)) ? 'check' : 'plus'} />
            {savedIds.has(String(anime.id)) ? 'Na Minha Lista' : 'Adicionar à Lista'}
          </button>
        </div>
      </div>
      {animes.length > 1 && (
        <>
          <button
            className="hero-arrow hero-arrow-left"
            onClick={() => selectSlide((activeIndex - 1 + animes.length) % animes.length)}
            aria-label="Destaque anterior"
          >
            <Icon name="chevronLeft" size={22} />
          </button>
          <button
            className="hero-arrow hero-arrow-right"
            onClick={() => selectSlide((activeIndex + 1) % animes.length)}
            aria-label="Próximo destaque"
          >
            <Icon name="chevronRight" size={22} />
          </button>
          <div className={`hero-indicators ${paused ? 'is-paused' : ''}`} aria-label="Selecionar destaque">
            {animes.map((slide, index) => (
              <button
                className={`hero-indicator ${index === activeIndex ? 'active' : ''}`}
                key={slide.id}
                onClick={() => selectSlide(index)}
                aria-label={`Destaque ${index + 1}: ${getAnimeTitle(slide)}`}
                aria-current={index === activeIndex ? 'true' : undefined}
              >
                <span />
              </button>
            ))}
          </div>
        </>
      )}
      {trailerUrl && (
        <button
          className="hero-sound-button"
          onClick={() => setIsMuted((muted) => !muted)}
          aria-label={isMuted ? 'Ativar som do trailer' : 'Silenciar trailer'}
          title={isMuted ? 'Ativar som' : 'Silenciar'}
        >
          <Icon name={isMuted ? 'volumeMuted' : 'volume'} size={18} />
        </button>
      )}
    </section>
  );
}

function AnimeDetailsModal({ anime, progress, onClose, onToggleEpisode }) {
  const [trailerLanguage, setTrailerLanguage] = useState('original');
  const title = getAnimeTitle(anime);
  const watched = progress[String(anime.id)]?.watched || [];
  const episodeTotal = getReleasedEpisodeCount(anime);
  const percentage = episodeTotal > 0
    ? Math.min(100, Math.round((watched.length / episodeTotal) * 100))
    : 0;
  const studio = anime.studios?.nodes?.[0]?.name;
  const mangaUrl = getLinkAmazonManga(title);
  const trailerId = anime.trailer?.site?.toLowerCase() === 'youtube' ? anime.trailer.id : null;
  const trailerSearch = trailerLanguage === 'dubbed'
    ? `${title} trailer dublado portugues`
    : `${title} trailer legendado pt br`;
  const trailerUrl = trailerLanguage === 'original'
    ? (trailerId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerId)}` : null)
    : `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(trailerSearch)}`;
  const configuredLinks = [
    {
      id: 'crunchyroll-channel',
      site: 'Crunchyroll via Prime Video Channels',
      tipoLink: 'crunchyroll',
      url: getLinkCrunchyroll(title),
    },
    {
      id: 'prime-video',
      site: 'Amazon Prime Video',
      tipoLink: 'prime_video',
      url: getLinkPrimeVideo(title),
    },
  ];
  const durationLabel = anime.duration ? `${anime.duration} min por episódio` : 'Duração não informada';
  const year = anime.startDate?.year || anime.seasonYear || 'Ano não informado';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal-close icon-button" onClick={onClose} aria-label="Fechar detalhes">
          <Icon name="close" />
        </button>
        <div
          className="details-banner"
          style={anime.bannerImage ? { backgroundImage: `url("${anime.bannerImage}")` } : undefined}
        />
        <div className="details-content">
          <div className="details-heading">
            <img className="details-cover" src={getCover(anime)} alt={`Capa de ${title}`} />
            <div className="details-heading-copy">
              <p className="eyebrow">AnimeOn · guia do anime</p>
              <h2 id="details-title">{title}</h2>
              <p className="details-meta">
                {[studio, year, durationLabel].filter(Boolean).join(' · ')}
              </p>
              <div className="genre-list">
                {(anime.genres || []).map((genre) => (
                  <span className="genre-chip" key={genre}>{genre}</span>
                ))}
              </div>
            </div>
          </div>

          <p className="details-synopsis">{stripHtml(anime.description || '') || 'Sinopse indisponível.'}</p>

          <section className="detail-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Seu progresso</p>
                <h3>Episódios assistidos</h3>
              </div>
              <strong className="progress-label">{percentage}%</strong>
            </div>
            <div className="progress-track large-progress">
              <span style={{ width: `${percentage}%` }} />
            </div>
            <p className="muted-copy">
              {watched.length} de {episodeTotal} episódios lançados marcados como assistidos.
              O rastreador não reproduz episódios.
            </p>
            {episodeTotal > 0 ? (
              <div className="episode-grid">
                {Array.from({ length: episodeTotal }, (_, index) => {
                  const episode = index + 1;
                  const isWatched = watched.includes(episode);
                  return (
                    <button
                      key={episode}
                      className={`episode-number ${isWatched ? 'watched' : ''}`}
                      onClick={() => onToggleEpisode(anime, episode)}
                      aria-pressed={isWatched}
                      aria-label={`Episódio ${episode}, ${isWatched ? 'assistido' : 'não assistido'}`}
                    >
                      {episode}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="empty-note">Ainda não há episódios lançados para acompanhar.</p>
            )}
            <div className="episode-cta">
              <a
                className="button-secondary manga-cta conversion-cta"
                href={mangaUrl}
                onClick={() => trackAffiliateClick({
                  animeTitulo: title,
                  tipoLink: 'manga',
                  urlDestino: mangaUrl,
                })}
                target="_blank"
                rel="sponsored noopener noreferrer"
              >
                Continuar a história no Mangá Oficial
                <span className="conversion-badge">MANGÁ OFICIAL</span>
                <Icon name="external" size={16} />
              </a>
              <p className="affiliate-disclosure">
                Link de busca na Amazon Brasil; a disponibilidade varia por título.
              </p>
            </div>
          </section>

          <section className="detail-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Vídeo oficial</p>
                <h3>Trailer</h3>
              </div>
            </div>
            <div className="trailer-options" role="group" aria-label="Idioma do trailer">
              <button
                className={`trailer-option ${trailerLanguage === 'dubbed' ? 'is-selected' : ''}`}
                type="button"
                aria-pressed={trailerLanguage === 'dubbed'}
                onClick={() => setTrailerLanguage((current) => (current === 'dubbed' ? 'original' : 'dubbed'))}
              >
                🇧🇷 Dublado (PT-BR)
              </button>
              <button
                className={`trailer-option ${trailerLanguage === 'subbed' ? 'is-selected' : ''}`}
                type="button"
                aria-pressed={trailerLanguage === 'subbed'}
                onClick={() => setTrailerLanguage((current) => (current === 'subbed' ? 'original' : 'subbed'))}
              >
                💬 Legendado (PT-BR)
              </button>
            </div>
            {trailerUrl ? (
              <div className="trailer-frame">
                <iframe
                  key={trailerUrl}
                  src={trailerUrl}
                  title={`Trailer de ${title}`}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            ) : (
              <p className="empty-note">A AniList não possui um trailer disponível para este título.</p>
            )}
          </section>

          <section className="detail-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Descoberta e coleção</p>
                <h3>Onde Assistir</h3>
              </div>
            </div>
            <div className="link-list">
              {configuredLinks.map((link) => (
                <a
                  className="service-link conversion-cta"
                  href={link.url}
                  onClick={() => trackAffiliateClick({
                    animeTitulo: title,
                    tipoLink: link.tipoLink,
                    urlDestino: link.url,
                  })}
                  key={link.id || link.url}
                  target="_blank"
                  rel="sponsored noopener noreferrer"
                >
                  {link.site}
                  <span className="conversion-badge">ASSINAR AGORA</span>
                  <Icon name="external" size={16} />
                </a>
              ))}
            </div>
            <p className="empty-note">
              Canais oficiais de afiliado da Amazon; catálogo e disponibilidade podem variar por região.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}

function AnimeOnApp() {
  const [animeList, setAnimeList] = useState([]);
  const [trendingHighlights, setTrendingHighlights] = useState([]);
  const [trendingError, setTrendingError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState('trending');
  const [activeTab, setActiveTab] = useState('catalog');
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [savedList, setSavedList] = useState(readSavedList);
  const [episodeProgress, setEpisodeProgress] = useState(readEpisodeProgress);
  const [selectedAnime, setSelectedAnime] = useState(null);
  const requestSequence = useRef(0);
  const loadMoreController = useRef(null);
  const loadMoreLock = useRef(false);

  useEffect(() => {
    localStorage.setItem('animeon_saved_list', JSON.stringify(savedList));
  }, [savedList]);

  useEffect(() => {
    localStorage.setItem('animeon_episode_progress', JSON.stringify(episodeProgress));
  }, [episodeProgress]);

  useEffect(() => {
    if (activeTab !== 'catalog') return undefined;

    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    let debounceTimer;

    const load = async () => {
      try {
        const query = searchText.trim();
        const result = await fetchAniList(
          getCategoryVariables(activeCategory, query),
          controller.signal,
        );
        if (sequence !== requestSequence.current) return;
        setAnimeList(result.media);
        if (activeCategory === 'trending') {
          setTrendingHighlights(result.media.slice(0, 5));
          setTrendingError('');
        }
        setCurrentPage(result.pageInfo.currentPage || 1);
        setHasMore(result.pageInfo.hasNextPage);
        setMoreError('');
        setIsLoading(false);
      } catch (error) {
        if (sequence !== requestSequence.current) return;
        setIsLoading(false);
        setHasMore(false);
        setApiError(error instanceof Error ? error.message : 'Não foi possível carregar o catálogo.');
        setAnimeList([]);
      }
    };

    if (activeCategory === 'search') {
      if (searchText.trim().length >= 2) {
        debounceTimer = setTimeout(load, 350);
      }
    } else {
      load();
    }

    return () => {
      clearTimeout(debounceTimer);
      controller.abort();
      loadMoreController.current?.abort();
      if (requestSequence.current === sequence) requestSequence.current += 1;
    };
  }, [activeCategory, activeTab, reloadKey, searchText]);

  useEffect(() => {
    let activeController;

    const refreshTrendingHighlights = async () => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const result = await fetchAniList(getCategoryVariables('trending', ''), controller.signal);
        if (controller.signal.aborted) return;
        setTrendingHighlights(result.media.slice(0, 5));
        setTrendingError('');
      } catch (error) {
        if (!controller.signal.aborted) {
          setTrendingError(error instanceof Error
            ? `Não foi possível atualizar os destaques: ${error.message}`
            : 'Não foi possível atualizar os destaques agora.');
        }
      }
    };

    const timer = setInterval(refreshTrendingHighlights, 24 * 60 * 60 * 1000);
    return () => {
      clearInterval(timer);
      activeController?.abort();
    };
  }, []);

  useEffect(() => {
    if (!selectedAnime) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedAnime]);

  const savedIds = useMemo(
    () => new Set(savedList.map((anime) => String(anime.id))),
    [savedList],
  );

  const watchedStats = useMemo(() => Object.values(episodeProgress).reduce((total, entry) => {
    const watched = Array.isArray(entry.watched) ? entry.watched.length : 0;
    const duration = Number(entry.duration) || 24;
    return {
      episodes: total.episodes + watched,
      hours: total.hours + (watched * duration) / 60,
    };
  }, { episodes: 0, hours: 0 }), [episodeProgress]);

  const loadMore = async () => {
    if (!hasMore || isLoadingMore || loadMoreLock.current) return;

    loadMoreLock.current = true;
    setIsLoadingMore(true);
    setMoreError('');
    const controller = new AbortController();
    loadMoreController.current = controller;
    const nextPage = currentPage + 1;

    try {
      const result = await fetchAniList(
        getCategoryVariables(activeCategory, searchText.trim(), nextPage),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setAnimeList((current) => [...current, ...result.media]);
      setCurrentPage(result.pageInfo.currentPage || nextPage);
      setHasMore(result.pageInfo.hasNextPage);
    } catch (error) {
      if (!controller.signal.aborted) {
        setMoreError(error instanceof Error ? error.message : 'Não foi possível carregar mais animes.');
      }
    } finally {
      if (loadMoreController.current === controller) loadMoreController.current = null;
      loadMoreLock.current = false;
      setIsLoadingMore(false);
    }
  };

  const handleSearchChange = (value) => {
    const query = value.trim();
    setSearchText(value);
    setActiveTab('catalog');
    if (query.length >= 2) {
      setIsLoading(true);
      setApiError('');
      setMoreError('');
      setActiveCategory('search');
    } else if (query.length === 1 && activeCategory === 'search') {
      setIsLoading(false);
      setAnimeList([]);
      setApiError('Digite pelo menos dois caracteres para pesquisar.');
    } else if (!query && activeCategory === 'search') {
      setIsLoading(true);
      setApiError('');
      setActiveCategory('trending');
    }
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setActiveTab('catalog');
    if (searchText.trim().length < 2) {
      setIsLoading(false);
      setAnimeList([]);
      setApiError('Digite pelo menos dois caracteres para pesquisar.');
      setActiveCategory('search');
      return;
    }
    setIsLoading(true);
    setApiError('');
    setMoreError('');
    setActiveCategory('search');
  };

  const chooseCategory = (category) => {
    setIsLoading(true);
    setApiError('');
    setMoreError('');
    setSearchText('');
    setActiveCategory(category);
    setActiveTab('catalog');
  };

  const toggleSaved = (anime) => {
    setSavedList((current) => (
      current.some((item) => String(item.id) === String(anime.id))
        ? current.filter((item) => String(item.id) !== String(anime.id))
        : [...current, anime]
    ));
  };

  const toggleEpisode = (anime, episode) => {
    const id = String(anime.id);
    setEpisodeProgress((current) => {
      const previous = current[id] || { watched: [], duration: anime.duration || 24 };
      const watched = new Set(previous.watched || []);
      if (watched.has(episode)) watched.delete(episode);
      else watched.add(episode);

      return {
        ...current,
        [id]: {
          watched: Array.from(watched).sort((a, b) => a - b),
          duration: Number(anime.duration) || Number(previous.duration) || 24,
        },
      };
    });
  };

  const retryCatalog = () => {
    setIsLoading(true);
    setApiError('');
    setMoreError('');
    setReloadKey((current) => current + 1);
  };
  const featuredAnime = activeTab === 'catalog' && activeCategory !== 'search'
    ? (trendingHighlights.length > 0 ? trendingHighlights : animeList.slice(0, 5))
    : [];
  const visibleList = activeTab === 'catalog' ? animeList : savedList;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand-logo" href="/" aria-label="AnimeOn, início">
            <span className="brand-anime">Anime</span>
            <span className="brand-on">
              On
              <Icon name="play" size={22} />
            </span>
          </a>

          <form className="search-form" role="search" onSubmit={handleSearchSubmit}>
            <Icon name="search" className="search-icon" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Buscar anime por título"
              aria-label="Buscar anime por título"
            />
            {searchText && (
              <button
                className="clear-search icon-button"
                type="button"
                onClick={() => handleSearchChange('')}
                aria-label="Limpar busca"
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </form>

          <nav className="main-tabs" aria-label="Navegação principal">
            <button
              className={activeTab === 'catalog' ? 'active' : ''}
              onClick={() => setActiveTab('catalog')}
            >
              Catálogo
            </button>
            <button
              className={activeTab === 'list' ? 'active' : ''}
              onClick={() => setActiveTab('list')}
            >
              <Icon name="bookmark" size={16} />
              Minha Lista
              <span className="tab-count">{savedList.length}</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="page-content">
        {activeTab === 'catalog' ? (
          <>
            {isLoading ? (
              <CatalogSkeleton />
            ) : apiError ? (
              <div className="error-panel">
                <Icon name="film" size={28} />
                <h2>Não foi possível carregar o catálogo</h2>
                <p>{apiError}</p>
                <button className="button-primary" onClick={retryCatalog}>Tentar novamente</button>
              </div>
            ) : animeList.length === 0 ? (
              <div className="empty-state">
                <Icon name="search" size={28} />
                <h2>Nenhum anime encontrado</h2>
                <p>Tente outro título ou escolha uma seção do catálogo.</p>
              </div>
            ) : (
              <>
                {featuredAnime.length > 0 && (
                  <FeaturedHero
                    key={`trending-${featuredAnime[0].id}`}
                    animes={featuredAnime}
                    savedIds={savedIds}
                    trendingError={trendingError}
                    onOpen={setSelectedAnime}
                    onToggleSaved={toggleSaved}
                  />
                )}

                <section className="catalog-section">
                  <div className="category-scroller" aria-label="Seções do catálogo">
                    {CATEGORIES.map((category) => (
                      <button
                        key={category.id}
                        className={`category-chip ${activeCategory === category.id ? 'active' : ''}`}
                        onClick={() => chooseCategory(category.id)}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>
                  <div className="section-heading catalog-heading">
                    <div>
                      <p className="eyebrow">Descubra seu próximo anime</p>
                      <h2>
                        {activeCategory === 'search'
                          ? `Resultados para “${searchText.trim()}”`
                          : CATEGORIES.find((category) => category.id === activeCategory)?.label}
                      </h2>
                    </div>
                    <span className="result-count">{animeList.length} títulos</span>
                  </div>
                  <div className="anime-grid">
                    {animeList.map((anime) => (
                      <AnimeCard
                        key={anime.id}
                        anime={anime}
                        progress={episodeProgress}
                        isSaved={savedIds.has(String(anime.id))}
                        onOpen={setSelectedAnime}
                        onToggleSaved={toggleSaved}
                      />
                    ))}
                  </div>
                  {hasMore && (
                    <div className="load-more-area">
                      {moreError && <p className="load-more-error">{moreError}</p>}
                      <button
                        className="button-secondary load-more-button"
                        onClick={loadMore}
                        disabled={isLoadingMore}
                      >
                        {isLoadingMore && <span className="button-spinner" aria-hidden="true" />}
                        {isLoadingMore ? 'Carregando títulos' : 'Carregar mais animes'}
                      </button>
                      <p className="muted-copy">Exibindo {animeList.length} títulos desta seção.</p>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        ) : (
          <section className="my-list-page">
            <div className="list-intro">
              <p className="eyebrow">Sua biblioteca pessoal</p>
              <h1>Minha Lista</h1>
              <p>Continue de onde parou e acompanhe seu progresso.</p>
            </div>
            <div className="metrics-grid">
              <article className="metric-card">
                <span className="metric-icon"><Icon name="bookmark" /></span>
                <p>Animes salvos</p>
                <strong>{savedList.length}</strong>
              </article>
              <article className="metric-card">
                <span className="metric-icon"><Icon name="check" /></span>
                <p>Episódios assistidos</p>
                <strong>{watchedStats.episodes}</strong>
              </article>
              <article className="metric-card">
                <span className="metric-icon"><Icon name="clock" /></span>
                <p>Horas estimadas</p>
                <strong>{watchedStats.hours.toFixed(1)}</strong>
                <small>calculadas pela duração de cada anime</small>
              </article>
            </div>
            {visibleList.length > 0 ? (
              <div className="anime-grid list-grid">
                {visibleList.map((anime) => (
                  <AnimeCard
                    key={anime.id}
                    anime={anime}
                    progress={episodeProgress}
                    isSaved
                    onOpen={setSelectedAnime}
                    onToggleSaved={toggleSaved}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state list-empty">
                <Icon name="bookmark" size={28} />
                <h2>Sua lista está vazia</h2>
                <p>Salve animes do catálogo para encontrá-los aqui.</p>
                <button className="button-primary" onClick={() => setActiveTab('catalog')}>
                  Explorar catálogo
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      {selectedAnime && (
        <AnimeDetailsModal
          anime={selectedAnime}
          progress={episodeProgress}
          onClose={() => setSelectedAnime(null)}
          onToggleEpisode={toggleEpisode}
        />
      )}
    </div>
  );
}

function App() {
  const [adminRoute, setAdminRoute] = useState(isAdminRoute);

  useEffect(() => {
    captureTrafficOrigin();
    const updateRoute = () => setAdminRoute(isAdminRoute());
    window.addEventListener('popstate', updateRoute);
    window.addEventListener('hashchange', updateRoute);
    return () => {
      window.removeEventListener('popstate', updateRoute);
      window.removeEventListener('hashchange', updateRoute);
    };
  }, []);

  return adminRoute ? <AdminPanel /> : <AnimeOnApp />;
}

export default App;