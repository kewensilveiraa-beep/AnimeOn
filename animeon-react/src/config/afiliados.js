export const AFILIADOS_CONFIG = {
  amazonEnabled: true,
  amazonTag: 'animeon09-20',
};

/**
 * Remove sufixos de temporada, arcos e caracteres especiais vindos do AniList
 * para melhorar a precisão na busca de mangás da Amazon BR.
 */
function limparTituloParaBusca(titulo = '') {
  return titulo
    .replace(/\b(\d+(st|nd|rd|th)?\s*Season|Season\s*\d+|Part\s*\d+|Cour\s*\d+|Final\s*Season|The\s*Final|OVA|ONA|Movie|Specials?)\b/gi, '')
    .replace(/[:\-–—|/\\()[\]{}"'!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getLinkCrunchyroll() {
  return `https://www.amazon.com.br/gp/video/primesignup?tag=${AFILIADOS_CONFIG.amazonTag}`;
}

export function getLinkPrimeVideo() {
  return `https://www.amazon.com.br/gp/video/primesignup?tag=${AFILIADOS_CONFIG.amazonTag}`;
}

export function getLinkAmazonManga(titulo = '') {
  const tituloLimpo = limparTituloParaBusca(titulo);
  const search = new URLSearchParams({
    k: `${tituloLimpo || titulo.trim()} mangá`,
    i: 'stripbooks',
    tag: AFILIADOS_CONFIG.amazonTag,
  });
  return `https://www.amazon.com.br/s?${search.toString()}`;
}