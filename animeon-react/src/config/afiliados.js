export const AFILIADOS_CONFIG = {
  amazonEnabled: true,
  amazonTag: 'animeon09-20',
  crunchyrollBenefitId: 'crunchyrollbr',
};

export function getLinkCrunchyroll() {
  return `https://www.amazon.com.br/gp/video/storefront?benefitId=${AFILIADOS_CONFIG.crunchyrollBenefitId}&tag=${AFILIADOS_CONFIG.amazonTag}`;
}

export function getLinkPrimeVideo() {
  return `https://www.amazon.com.br/gp/video/storefront?tag=${AFILIADOS_CONFIG.amazonTag}`;
}

export function getLinkAmazonManga(titulo) {
  const search = new URLSearchParams({
    k: `${titulo.trim()} mangá oficial`,
    tag: AFILIADOS_CONFIG.amazonTag,
  });
  return `https://www.amazon.com.br/s?${search.toString()}`;
}
