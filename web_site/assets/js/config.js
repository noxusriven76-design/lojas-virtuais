// ---------------------------------------------------------------------------
// Configuração central do FRONT (site estático)
//
// Implementamos apenas 1 loja agora (fixa por pasta/build).
// Para criar as outras 2 lojas no futuro:
//   1) copie a pasta `web_site/` para `web_site_relogios/` e `web_site_agro/`
//   2) troque apenas o STORE_SLUG abaixo (e, se necessário, o API_BASE_URL)
// ---------------------------------------------------------------------------

// Loja fixa deste front.
const STORE_SLUG = 'roupas';

// Base URL da API (inclui /api/v1).
// Em produção, aponte para o domínio real do backend.
const API_BASE_URL = (window.__API_BASE_URL__ || 'http://localhost:8000/api/v1');

// Mock desativado por padrão. Para depurar offline, sobrescreva em runtime:
//   window.__USE_MOCK_DATA__ = true;
const USE_MOCK_DATA = (window.__USE_MOCK_DATA__ === true);

// Exporta para outros scripts.
window.LV_CONFIG = {
  STORE_SLUG,
  API_BASE_URL,
  USE_MOCK_DATA,
};
