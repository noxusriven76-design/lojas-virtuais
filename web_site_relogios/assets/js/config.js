// ---------------------------------------------------------------------------
// Configurao central do FRONT (site esttico)
//
// Implementamos apenas 1 loja agora (fixa por pasta/build).
// Para criar as outras 2 lojas no futuro:
//   1) copie a pasta `web_site/` para `web_site_relogios/` e `web_site_agro/`
//   2) troque apenas o STORE_SLUG abaixo (e, se necessrio, o API_BASE_URL)
// ---------------------------------------------------------------------------

// Loja fixa deste front.
export const STORE_SLUG = 'relogios';

// Base URL da API (inclui /api/v1).
// Em produo, aponte para o domnio real do backend.
export const API_BASE_URL = (window.__API_BASE_URL__ || 'http://localhost:8000/api/v1');

// Mock desativado por padro. Para depurar offline, sobrescreva em runtime:
//   window.__USE_MOCK_DATA__ = true;
export const USE_MOCK_DATA = (window.__USE_MOCK_DATA__ === true);

export const LV_CONFIG = {
  STORE_SLUG,
  API_BASE_URL,
  USE_MOCK_DATA,
};

// Compatibilidade: o projeto antigo lia do escopo global.
window.LV_CONFIG = LV_CONFIG;

