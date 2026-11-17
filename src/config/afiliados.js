export const AFILIADOS_CONFIG = {
  amazonTag: 'animeon-20',
  crunchyrollBaseUrl: 'https://www.crunchyroll.com/pt-br/search?q=',
  primeVideoTag: 'animeon-20',
};

export function getLinkCrunchyroll(titulo) {
  return `${AFILIADOS_CONFIG.crunchyrollBaseUrl}${encodeURIComponent(titulo.trim())}`;
}

export function getLinkPrimeVideo(titulo) {
  const search = new URLSearchParams({
    phrase: titulo.trim(),
    tag: AFILIADOS_CONFIG.primeVideoTag,
  });
  return `https://www.primevideo.com/search?${search.toString()}`;
}

export function getLinkAmazonManga(titulo) {
  const search = new URLSearchParams({
    k: `${titulo.trim()} mangá oficial`,
    tag: AFILIADOS_CONFIG.amazonTag,
  });
  return `https://www.amazon.com.br/s?${search.toString()}`;
}
