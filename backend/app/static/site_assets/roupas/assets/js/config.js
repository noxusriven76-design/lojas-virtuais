// ---------------------------------------------------------------------------
// Configuração central do FRONT (site estático)
//
// Implementamos apenas 1 loja agora (fixa por pasta/build).
// Para criar as outras 2 lojas no futuro:
//   1) copie a pasta `web_site/` para `web_site_relogios/` e `web_site_agro/`
//   2) troque apenas o STORE_SLUG abaixo (e, se necessário, o API_BASE_URL)
// ---------------------------------------------------------------------------

function resolveStoreSlug(){
  // /site/{slug}/...
  const m = String(window.location.pathname || '').match(/^\/site\/([^\/]+)(?:\/|$)/i);
  if(m && m[1]) return decodeURIComponent(m[1]);
  return 'roupas';
}

// Loja dinamica por URL; fallback para o tema.
export const STORE_SLUG = resolveStoreSlug();

// Base URL da API (inclui /api/v1).
// Em produção, aponte para o domínio real do backend.
export const API_BASE_URL = (window.__API_BASE_URL__ || 'http://localhost:8000/api/v1');

// Mock desativado por padrão. Para depurar offline, sobrescreva em runtime:
//   window.__USE_MOCK_DATA__ = true;
export const USE_MOCK_DATA = (window.__USE_MOCK_DATA__ === true);

export const LV_CONFIG = {
  STORE_SLUG,
  API_BASE_URL,
  USE_MOCK_DATA,
};

// Compatibilidade: o projeto antigo lia do escopo global.
window.LV_CONFIG = LV_CONFIG;
