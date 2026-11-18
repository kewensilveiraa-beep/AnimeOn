import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  || 'https://ezudbnpuurprcoeetlhy.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'sb_publishable_OgLoRncmja7oEq2Do8Schw_aro9lJnr';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ALLOWED_LINK_TYPES = new Set(['manga', 'crunchyroll', 'prime_video']);

export async function registrarCliqueAfiliado({ animeTitulo, tipoLink, urlDestino }) {
  if (!animeTitulo?.trim() || !ALLOWED_LINK_TYPES.has(tipoLink)) {
    throw new TypeError('Dados inválidos para registrar o clique de afiliado.');
  }

  const destination = new URL(urlDestino);
  if (destination.hostname !== 'www.amazon.com.br'
    || destination.searchParams.get('tag') !== 'animeon09-20') {
    throw new TypeError('O destino não corresponde a um link afiliado autorizado.');
  }

  const origemTrafego = window.sessionStorage.getItem('origem_trafego') || 'direto';
  const { error } = await supabase.from('cliques_afiliados').insert({
    anime_titulo: animeTitulo.trim().slice(0, 200),
    tipo_link: tipoLink,
    url_destino: destination.toString(),
    origem_trafego: origemTrafego.slice(0, 100),
  });

  if (error) throw error;
}
