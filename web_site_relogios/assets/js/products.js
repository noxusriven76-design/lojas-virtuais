/*
  Catlogo local (mock) + carregamento opcional via API.

  Objetivo:
  - Mock NO  a fonte principal (desativado por padro em assets/js/config.js)
  - Quando USE_MOCK_DATA=false, categorias/produtos vm do backend no contexto do STORE_SLUG.

  Observao:
  - O backend atual no possui campos de "slug" no modelo, ento o front gera slugs
    determinsticos (slugify(name + '-' + id)) para manter URLs estveis.
*/

import { LV_CONFIG } from './config.js';
import { apiGet, apiPost } from './core/apiClient.js';

const LV = (window.LV_CONFIG || LV_CONFIG || { STORE_SLUG: 'roupas', API_BASE_URL: 'http://localhost:8000/api/v1', USE_MOCK_DATA: false });

const STORE = { id: 1, slug: LV.STORE_SLUG, name: 'Loja de Roupas', legalName: 'Loja de Roupas LTDA', url: 'https://www.sualoja.com', currency: 'BRL', country: 'BR' };

let _runtimeCatalog = null; // { categories, products }
let _runtimeCatalogPromise = null;

function _slugify(str){
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function _withFallbackImg(url){
  const u = String(url || '').trim();
  return u ? u : 'assets/img/og-default.svg';
}

function _shortDescription(desc){
  const d = String(desc || '').replace(/\s+/g,' ').trim();
  if(!d) return 'Produto selecionado  confira detalhes e variaes disponveis.';
  return d.length > 120 ? (d.slice(0, 117) + '...') : d;
}
const CATEGORIES = [
  {
    "id": 1,
    "name": "Feminino",
    "slug": "feminino"
  },
  {
    "id": 2,
    "name": "Masculino",
    "slug": "masculino"
  },
  {
    "id": 3,
    "name": "Acessrios",
    "slug": "acessorios"
  },
  {
    "id": 4,
    "name": "Novidades",
    "slug": "novidades"
  },
  {
    "id": 5,
    "name": "Promoes",
    "slug": "promocoes"
  }
];
const PRODUCTS = [
  {
    "id": 1,
    "store_id": 1,
    "category_id": 1,
    "category": "Feminino",
    "slug": "vestido-midi-linho",
    "name": "Vestido Midi Linho",
    "description": "Vestido Midi Linho com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Vestido Midi Linho  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p01.svg",
    "images": [
      "assets/img/products/p01.svg",
      "assets/img/products/p01.svg",
      "assets/img/products/p01.svg"
    ],
    "base_price": 189.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": true,
      "mais_vendidos": false,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-001-PRE-P",
        "color": "Preto",
        "size": "P",
        "price": 189.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-001-PRE-M",
        "color": "Preto",
        "size": "M",
        "price": 189.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-001-PRE-G",
        "color": "Preto",
        "size": "G",
        "price": 189.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-001-ARE-P",
        "color": "Areia",
        "size": "P",
        "price": 189.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-001-ARE-M",
        "color": "Areia",
        "size": "M",
        "price": 189.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-001-ARE-G",
        "color": "Areia",
        "size": "G",
        "price": 189.9,
        "stock": 20,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 2,
    "store_id": 1,
    "category_id": 2,
    "category": "Masculino",
    "slug": "camisa-oversized-algodao",
    "name": "Camisa Oversized Algodo",
    "description": "Camisa Oversized Algodo com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Camisa Oversized Algodo  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p02.svg",
    "images": [
      "assets/img/products/p02.svg",
      "assets/img/products/p02.svg",
      "assets/img/products/p02.svg"
    ],
    "base_price": 149.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": true,
      "mais_vendidos": false,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-002-BRA-P",
        "color": "Branco",
        "size": "P",
        "price": 149.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-002-BRA-M",
        "color": "Branco",
        "size": "M",
        "price": 149.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-002-BRA-G",
        "color": "Branco",
        "size": "G",
        "price": 149.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-002-BRA-GG",
        "color": "Branco",
        "size": "GG",
        "price": 149.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-002-PRE-P",
        "color": "Preto",
        "size": "P",
        "price": 149.9,
        "stock": 20,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-002-PRE-M",
        "color": "Preto",
        "size": "M",
        "price": 149.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 7,
        "sku": "AUR-002-PRE-G",
        "color": "Preto",
        "size": "G",
        "price": 149.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 8,
        "sku": "AUR-002-PRE-GG",
        "color": "Preto",
        "size": "GG",
        "price": 149.9,
        "stock": 6,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 3,
    "store_id": 1,
    "category_id": 1,
    "category": "Feminino",
    "slug": "calca-alfaiataria-reta",
    "name": "Cala Alfaiataria Reta",
    "description": "Cala Alfaiataria Reta com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Cala Alfaiataria Reta  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p03.svg",
    "images": [
      "assets/img/products/p03.svg",
      "assets/img/products/p03.svg",
      "assets/img/products/p03.svg"
    ],
    "base_price": 229.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": true,
      "mais_vendidos": false,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-003-PRE-36",
        "color": "Preto",
        "size": "36",
        "price": 229.9,
        "stock": 20,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-003-PRE-38",
        "color": "Preto",
        "size": "38",
        "price": 229.9,
        "stock": 0,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-003-PRE-40",
        "color": "Preto",
        "size": "40",
        "price": 229.9,
        "stock": 20,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-003-PRE-42",
        "color": "Preto",
        "size": "42",
        "price": 229.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-003-CIN-36",
        "color": "Cinza",
        "size": "36",
        "price": 229.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-003-CIN-38",
        "color": "Cinza",
        "size": "38",
        "price": 229.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 7,
        "sku": "AUR-003-CIN-40",
        "color": "Cinza",
        "size": "40",
        "price": 229.9,
        "stock": 0,
        "active": true
      },
      {
        "id": 8,
        "sku": "AUR-003-CIN-42",
        "color": "Cinza",
        "size": "42",
        "price": 229.9,
        "stock": 20,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 4,
    "store_id": 1,
    "category_id": 2,
    "category": "Masculino",
    "slug": "jaqueta-jeans-classica",
    "name": "Jaqueta Jeans Clssica",
    "description": "Jaqueta Jeans Clssica com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Jaqueta Jeans Clssica  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p04.svg",
    "images": [
      "assets/img/products/p04.svg",
      "assets/img/products/p04.svg",
      "assets/img/products/p04.svg"
    ],
    "base_price": 259.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": true,
      "mais_vendidos": false,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-004-AZU-P",
        "color": "Azul",
        "size": "P",
        "price": 259.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-004-AZU-M",
        "color": "Azul",
        "size": "M",
        "price": 259.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-004-AZU-G",
        "color": "Azul",
        "size": "G",
        "price": 259.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-004-AZU-GG",
        "color": "Azul",
        "size": "GG",
        "price": 259.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-004-PRE-P",
        "color": "Preto",
        "size": "P",
        "price": 259.9,
        "stock": 0,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-004-PRE-M",
        "color": "Preto",
        "size": "M",
        "price": 259.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 7,
        "sku": "AUR-004-PRE-G",
        "color": "Preto",
        "size": "G",
        "price": 259.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 8,
        "sku": "AUR-004-PRE-GG",
        "color": "Preto",
        "size": "GG",
        "price": 259.9,
        "stock": 0,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 5,
    "store_id": 1,
    "category_id": 1,
    "category": "Feminino",
    "slug": "blusa-tricot-gola-alta",
    "name": "Blusa Tricot Gola Alta",
    "description": "Blusa Tricot Gola Alta com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Blusa Tricot Gola Alta  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p05.svg",
    "images": [
      "assets/img/products/p05.svg",
      "assets/img/products/p05.svg",
      "assets/img/products/p05.svg"
    ],
    "base_price": 169.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": true,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-005-OFF-P",
        "color": "Off-white",
        "size": "P",
        "price": 169.9,
        "stock": 0,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-005-OFF-M",
        "color": "Off-white",
        "size": "M",
        "price": 169.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-005-OFF-G",
        "color": "Off-white",
        "size": "G",
        "price": 169.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-005-PRE-P",
        "color": "Preto",
        "size": "P",
        "price": 169.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-005-PRE-M",
        "color": "Preto",
        "size": "M",
        "price": 169.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-005-PRE-G",
        "color": "Preto",
        "size": "G",
        "price": 169.9,
        "stock": 20,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 6,
    "store_id": 1,
    "category_id": 2,
    "category": "Masculino",
    "slug": "camiseta-basica-premium",
    "name": "Camiseta Bsica Premium",
    "description": "Camiseta Bsica Premium com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Camiseta Bsica Premium  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p06.svg",
    "images": [
      "assets/img/products/p06.svg",
      "assets/img/products/p06.svg",
      "assets/img/products/p06.svg"
    ],
    "base_price": 89.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": true,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-006-BRA-P",
        "color": "Branco",
        "size": "P",
        "price": 89.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-006-BRA-M",
        "color": "Branco",
        "size": "M",
        "price": 89.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-006-BRA-G",
        "color": "Branco",
        "size": "G",
        "price": 89.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-006-BRA-GG",
        "color": "Branco",
        "size": "GG",
        "price": 89.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-006-CHU-P",
        "color": "Chumbo",
        "size": "P",
        "price": 89.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-006-CHU-M",
        "color": "Chumbo",
        "size": "M",
        "price": 89.9,
        "stock": 0,
        "active": true
      },
      {
        "id": 7,
        "sku": "AUR-006-CHU-G",
        "color": "Chumbo",
        "size": "G",
        "price": 89.9,
        "stock": 0,
        "active": true
      },
      {
        "id": 8,
        "sku": "AUR-006-CHU-GG",
        "color": "Chumbo",
        "size": "GG",
        "price": 89.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 9,
        "sku": "AUR-006-PRE-P",
        "color": "Preto",
        "size": "P",
        "price": 89.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 10,
        "sku": "AUR-006-PRE-M",
        "color": "Preto",
        "size": "M",
        "price": 89.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 11,
        "sku": "AUR-006-PRE-G",
        "color": "Preto",
        "size": "G",
        "price": 89.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 12,
        "sku": "AUR-006-PRE-GG",
        "color": "Preto",
        "size": "GG",
        "price": 89.9,
        "stock": 6,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 7,
    "store_id": 1,
    "category_id": 1,
    "category": "Feminino",
    "slug": "saia-plissada-satin",
    "name": "Saia Plissada Satin",
    "description": "Saia Plissada Satin com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Saia Plissada Satin  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p07.svg",
    "images": [
      "assets/img/products/p07.svg",
      "assets/img/products/p07.svg",
      "assets/img/products/p07.svg"
    ],
    "base_price": 179.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": true,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-007-CHA-P",
        "color": "Champagne",
        "size": "P",
        "price": 179.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-007-CHA-M",
        "color": "Champagne",
        "size": "M",
        "price": 179.9,
        "stock": 20,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-007-CHA-G",
        "color": "Champagne",
        "size": "G",
        "price": 179.9,
        "stock": 20,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-007-PRE-P",
        "color": "Preto",
        "size": "P",
        "price": 179.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-007-PRE-M",
        "color": "Preto",
        "size": "M",
        "price": 179.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-007-PRE-G",
        "color": "Preto",
        "size": "G",
        "price": 179.9,
        "stock": 12,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 8,
    "store_id": 1,
    "category_id": 3,
    "category": "Acessrios",
    "slug": "tenis-minimal-couro",
    "name": "Tnis Minimal Couro",
    "description": "Tnis Minimal Couro com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Tnis Minimal Couro  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p08.svg",
    "images": [
      "assets/img/products/p08.svg",
      "assets/img/products/p08.svg",
      "assets/img/products/p08.svg"
    ],
    "base_price": 329.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": true,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-008-BRA-38",
        "color": "Branco",
        "size": "38",
        "price": 329.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-008-BRA-39",
        "color": "Branco",
        "size": "39",
        "price": 329.9,
        "stock": 0,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-008-BRA-40",
        "color": "Branco",
        "size": "40",
        "price": 329.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-008-BRA-41",
        "color": "Branco",
        "size": "41",
        "price": 329.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-008-BRA-42",
        "color": "Branco",
        "size": "42",
        "price": 329.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-008-PRE-38",
        "color": "Preto",
        "size": "38",
        "price": 329.9,
        "stock": 20,
        "active": true
      },
      {
        "id": 7,
        "sku": "AUR-008-PRE-39",
        "color": "Preto",
        "size": "39",
        "price": 329.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 8,
        "sku": "AUR-008-PRE-40",
        "color": "Preto",
        "size": "40",
        "price": 329.9,
        "stock": 20,
        "active": true
      },
      {
        "id": 9,
        "sku": "AUR-008-PRE-41",
        "color": "Preto",
        "size": "41",
        "price": 329.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 10,
        "sku": "AUR-008-PRE-42",
        "color": "Preto",
        "size": "42",
        "price": 329.9,
        "stock": 3,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 9,
    "store_id": 1,
    "category_id": 3,
    "category": "Acessrios",
    "slug": "bolsa-tote-estruturada",
    "name": "Bolsa Tote Estruturada",
    "description": "Bolsa Tote Estruturada com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Bolsa Tote Estruturada  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p09.svg",
    "images": [
      "assets/img/products/p09.svg",
      "assets/img/products/p09.svg",
      "assets/img/products/p09.svg"
    ],
    "base_price": 219.9,
    "sale_price": 175.92,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": false,
      "promocoes": true
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-009-PRE-UNI",
        "color": "Preto",
        "size": "nico",
        "price": 175.92,
        "stock": 20,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-009-CAR-UNI",
        "color": "Caramelo",
        "size": "nico",
        "price": 175.92,
        "stock": 0,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 10,
    "store_id": 1,
    "category_id": 3,
    "category": "Acessrios",
    "slug": "cinto-couro-fivela-fina",
    "name": "Cinto Couro Fivela Fina",
    "description": "Cinto Couro Fivela Fina com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Cinto Couro Fivela Fina  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p10.svg",
    "images": [
      "assets/img/products/p10.svg",
      "assets/img/products/p10.svg",
      "assets/img/products/p10.svg"
    ],
    "base_price": 99.9,
    "sale_price": 89.91,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": false,
      "promocoes": true
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-010-PRE-P",
        "color": "Preto",
        "size": "P",
        "price": 89.91,
        "stock": 12,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-010-PRE-M",
        "color": "Preto",
        "size": "M",
        "price": 89.91,
        "stock": 3,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-010-PRE-G",
        "color": "Preto",
        "size": "G",
        "price": 89.91,
        "stock": 0,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-010-MAR-P",
        "color": "Marrom",
        "size": "P",
        "price": 89.91,
        "stock": 3,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-010-MAR-M",
        "color": "Marrom",
        "size": "M",
        "price": 89.91,
        "stock": 20,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-010-MAR-G",
        "color": "Marrom",
        "size": "G",
        "price": 89.91,
        "stock": 6,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 11,
    "store_id": 1,
    "category_id": 2,
    "category": "Masculino",
    "slug": "moletom-canguru-essentials",
    "name": "Moletom Canguru Essentials",
    "description": "Moletom Canguru Essentials com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Moletom Canguru Essentials  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p11.svg",
    "images": [
      "assets/img/products/p11.svg",
      "assets/img/products/p11.svg",
      "assets/img/products/p11.svg"
    ],
    "base_price": 199.9,
    "sale_price": 159.92,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": false,
      "promocoes": true
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-011-CIN-P",
        "color": "Cinza",
        "size": "P",
        "price": 159.92,
        "stock": 6,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-011-CIN-M",
        "color": "Cinza",
        "size": "M",
        "price": 159.92,
        "stock": 6,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-011-CIN-G",
        "color": "Cinza",
        "size": "G",
        "price": 159.92,
        "stock": 6,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-011-CIN-GG",
        "color": "Cinza",
        "size": "GG",
        "price": 159.92,
        "stock": 0,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-011-PRE-P",
        "color": "Preto",
        "size": "P",
        "price": 159.92,
        "stock": 3,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-011-PRE-M",
        "color": "Preto",
        "size": "M",
        "price": 159.92,
        "stock": 20,
        "active": true
      },
      {
        "id": 7,
        "sku": "AUR-011-PRE-G",
        "color": "Preto",
        "size": "G",
        "price": 159.92,
        "stock": 12,
        "active": true
      },
      {
        "id": 8,
        "sku": "AUR-011-PRE-GG",
        "color": "Preto",
        "size": "GG",
        "price": 159.92,
        "stock": 0,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 12,
    "store_id": 1,
    "category_id": 1,
    "category": "Feminino",
    "slug": "blazer-acinturado",
    "name": "Blazer Acinturado",
    "description": "Blazer Acinturado com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Blazer Acinturado  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p12.svg",
    "images": [
      "assets/img/products/p12.svg",
      "assets/img/products/p12.svg",
      "assets/img/products/p12.svg"
    ],
    "base_price": 299.9,
    "sale_price": 269.91,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": false,
      "promocoes": true
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-012-PRE-36",
        "color": "Preto",
        "size": "36",
        "price": 269.91,
        "stock": 0,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-012-PRE-38",
        "color": "Preto",
        "size": "38",
        "price": 269.91,
        "stock": 0,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-012-PRE-40",
        "color": "Preto",
        "size": "40",
        "price": 269.91,
        "stock": 20,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-012-PRE-42",
        "color": "Preto",
        "size": "42",
        "price": 269.91,
        "stock": 0,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-012-CIN-36",
        "color": "Cinza",
        "size": "36",
        "price": 269.91,
        "stock": 20,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-012-CIN-38",
        "color": "Cinza",
        "size": "38",
        "price": 269.91,
        "stock": 3,
        "active": true
      },
      {
        "id": 7,
        "sku": "AUR-012-CIN-40",
        "color": "Cinza",
        "size": "40",
        "price": 269.91,
        "stock": 12,
        "active": true
      },
      {
        "id": 8,
        "sku": "AUR-012-CIN-42",
        "color": "Cinza",
        "size": "42",
        "price": 269.91,
        "stock": 12,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 13,
    "store_id": 1,
    "category_id": 2,
    "category": "Masculino",
    "slug": "camisa-social-slim",
    "name": "Camisa Social Slim",
    "description": "Camisa Social Slim com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Camisa Social Slim  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p13.svg",
    "images": [
      "assets/img/products/p13.svg",
      "assets/img/products/p13.svg",
      "assets/img/products/p13.svg"
    ],
    "base_price": 169.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": false,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-013-BRA-P",
        "color": "Branco",
        "size": "P",
        "price": 169.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-013-BRA-M",
        "color": "Branco",
        "size": "M",
        "price": 169.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-013-BRA-G",
        "color": "Branco",
        "size": "G",
        "price": 169.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-013-BRA-GG",
        "color": "Branco",
        "size": "GG",
        "price": 169.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-013-AZU-P",
        "color": "Azul",
        "size": "P",
        "price": 169.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-013-AZU-M",
        "color": "Azul",
        "size": "M",
        "price": 169.9,
        "stock": 20,
        "active": true
      },
      {
        "id": 7,
        "sku": "AUR-013-AZU-G",
        "color": "Azul",
        "size": "G",
        "price": 169.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 8,
        "sku": "AUR-013-AZU-GG",
        "color": "Azul",
        "size": "GG",
        "price": 169.9,
        "stock": 20,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 14,
    "store_id": 1,
    "category_id": 1,
    "category": "Feminino",
    "slug": "shorts-linho-cintura-alta",
    "name": "Shorts Linho Cintura Alta",
    "description": "Shorts Linho Cintura Alta com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Shorts Linho Cintura Alta  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p14.svg",
    "images": [
      "assets/img/products/p14.svg",
      "assets/img/products/p14.svg",
      "assets/img/products/p14.svg"
    ],
    "base_price": 139.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": false,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-014-ARE-36",
        "color": "Areia",
        "size": "36",
        "price": 139.9,
        "stock": 20,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-014-ARE-38",
        "color": "Areia",
        "size": "38",
        "price": 139.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-014-ARE-40",
        "color": "Areia",
        "size": "40",
        "price": 139.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-014-ARE-42",
        "color": "Areia",
        "size": "42",
        "price": 139.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-014-PRE-36",
        "color": "Preto",
        "size": "36",
        "price": 139.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-014-PRE-38",
        "color": "Preto",
        "size": "38",
        "price": 139.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 7,
        "sku": "AUR-014-PRE-40",
        "color": "Preto",
        "size": "40",
        "price": 139.9,
        "stock": 20,
        "active": true
      },
      {
        "id": 8,
        "sku": "AUR-014-PRE-42",
        "color": "Preto",
        "size": "42",
        "price": 139.9,
        "stock": 6,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 15,
    "store_id": 1,
    "category_id": 3,
    "category": "Acessrios",
    "slug": "oculos-retangular-fosco",
    "name": "culos Retangular Fosco",
    "description": "culos Retangular Fosco com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "culos Retangular Fosco  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p15.svg",
    "images": [
      "assets/img/products/p15.svg",
      "assets/img/products/p15.svg",
      "assets/img/products/p15.svg"
    ],
    "base_price": 129.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": false,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-015-PRE-UNI",
        "color": "Preto",
        "size": "nico",
        "price": 129.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-015-TAR-UNI",
        "color": "Tartaruga",
        "size": "nico",
        "price": 129.9,
        "stock": 12,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 16,
    "store_id": 1,
    "category_id": 1,
    "category": "Feminino",
    "slug": "vestido-curto-minimal",
    "name": "Vestido Curto Minimal",
    "description": "Vestido Curto Minimal com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Vestido Curto Minimal  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p16.svg",
    "images": [
      "assets/img/products/p16.svg",
      "assets/img/products/p16.svg",
      "assets/img/products/p16.svg"
    ],
    "base_price": 159.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": false,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-016-PRE-P",
        "color": "Preto",
        "size": "P",
        "price": 159.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-016-PRE-M",
        "color": "Preto",
        "size": "M",
        "price": 159.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-016-PRE-G",
        "color": "Preto",
        "size": "G",
        "price": 159.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-016-VER-P",
        "color": "Verde Oliva",
        "size": "P",
        "price": 159.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-016-VER-M",
        "color": "Verde Oliva",
        "size": "M",
        "price": 159.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-016-VER-G",
        "color": "Verde Oliva",
        "size": "G",
        "price": 159.9,
        "stock": 0,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 17,
    "store_id": 1,
    "category_id": 2,
    "category": "Masculino",
    "slug": "calca-jeans-slim-escura",
    "name": "Cala Jeans Slim Escura",
    "description": "Cala Jeans Slim Escura com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Cala Jeans Slim Escura  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p17.svg",
    "images": [
      "assets/img/products/p17.svg",
      "assets/img/products/p17.svg",
      "assets/img/products/p17.svg"
    ],
    "base_price": 199.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": false,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-017-AZU-38",
        "color": "Azul Escuro",
        "size": "38",
        "price": 199.9,
        "stock": 0,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-017-AZU-40",
        "color": "Azul Escuro",
        "size": "40",
        "price": 199.9,
        "stock": 0,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-017-AZU-42",
        "color": "Azul Escuro",
        "size": "42",
        "price": 199.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-017-AZU-44",
        "color": "Azul Escuro",
        "size": "44",
        "price": 199.9,
        "stock": 20,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 18,
    "store_id": 1,
    "category_id": 2,
    "category": "Masculino",
    "slug": "polo-piquet-classica",
    "name": "Polo Piquet Clssica",
    "description": "Polo Piquet Clssica com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Polo Piquet Clssica  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p18.svg",
    "images": [
      "assets/img/products/p18.svg",
      "assets/img/products/p18.svg",
      "assets/img/products/p18.svg"
    ],
    "base_price": 119.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": false,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-018-MAR-P",
        "color": "Marinho",
        "size": "P",
        "price": 119.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-018-MAR-M",
        "color": "Marinho",
        "size": "M",
        "price": 119.9,
        "stock": 0,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-018-MAR-G",
        "color": "Marinho",
        "size": "G",
        "price": 119.9,
        "stock": 20,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-018-MAR-GG",
        "color": "Marinho",
        "size": "GG",
        "price": 119.9,
        "stock": 0,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-018-PRE-P",
        "color": "Preto",
        "size": "P",
        "price": 119.9,
        "stock": 0,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-018-PRE-M",
        "color": "Preto",
        "size": "M",
        "price": 119.9,
        "stock": 20,
        "active": true
      },
      {
        "id": 7,
        "sku": "AUR-018-PRE-G",
        "color": "Preto",
        "size": "G",
        "price": 119.9,
        "stock": 0,
        "active": true
      },
      {
        "id": 8,
        "sku": "AUR-018-PRE-GG",
        "color": "Preto",
        "size": "GG",
        "price": 119.9,
        "stock": 6,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 19,
    "store_id": 1,
    "category_id": 1,
    "category": "Feminino",
    "slug": "top-alcas-ajustaveis",
    "name": "Top Alas Ajustveis",
    "description": "Top Alas Ajustveis com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Top Alas Ajustveis  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p19.svg",
    "images": [
      "assets/img/products/p19.svg",
      "assets/img/products/p19.svg",
      "assets/img/products/p19.svg"
    ],
    "base_price": 79.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": false,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-019-PRE-P",
        "color": "Preto",
        "size": "P",
        "price": 79.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 2,
        "sku": "AUR-019-PRE-M",
        "color": "Preto",
        "size": "M",
        "price": 79.9,
        "stock": 3,
        "active": true
      },
      {
        "id": 3,
        "sku": "AUR-019-PRE-G",
        "color": "Preto",
        "size": "G",
        "price": 79.9,
        "stock": 6,
        "active": true
      },
      {
        "id": 4,
        "sku": "AUR-019-OFF-P",
        "color": "Off-white",
        "size": "P",
        "price": 79.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 5,
        "sku": "AUR-019-OFF-M",
        "color": "Off-white",
        "size": "M",
        "price": 79.9,
        "stock": 12,
        "active": true
      },
      {
        "id": 6,
        "sku": "AUR-019-OFF-G",
        "color": "Off-white",
        "size": "G",
        "price": 79.9,
        "stock": 0,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  },
  {
    "id": 20,
    "store_id": 1,
    "category_id": 3,
    "category": "Acessrios",
    "slug": "lenco-seda-estampado",
    "name": "Leno Seda Estampado",
    "description": "Leno Seda Estampado com caimento moderno e acabamento limpo. Ideal para compor looks versteis do dia a dia ao trabalho. Tecido confortvel, toque suave e modelagem pensada para vestir bem.",
    "short_description": "Leno Seda Estampado  minimalista, confortvel e fcil de combinar.",
    "brand": "Aurora",
    "image_url": "assets/img/products/p20.svg",
    "images": [
      "assets/img/products/p20.svg",
      "assets/img/products/p20.svg",
      "assets/img/products/p20.svg"
    ],
    "base_price": 89.9,
    "sale_price": null,
    "is_active": true,
    "collections": {
      "novidades": false,
      "mais_vendidos": false,
      "promocoes": false
    },
    "variants": [
      {
        "id": 1,
        "sku": "AUR-020-PRE-UNI",
        "color": "Preto/Creme",
        "size": "nico",
        "price": 89.9,
        "stock": 6,
        "active": true
      }
    ],
    "rating_placeholder": {
      "value": 4.7,
      "count": 128
    }
  }
];

function formatBRL(value){
  try { return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  catch(e){ return 'R$ ' + (Math.round(value*100)/100).toFixed(2).replace('.', ','); }
}

function _categories(){ return (_runtimeCatalog && _runtimeCatalog.categories) ? _runtimeCatalog.categories : CATEGORIES; }
function _products(){ return (_runtimeCatalog && _runtimeCatalog.products) ? _runtimeCatalog.products : PRODUCTS; }

function getCategoryBySlug(slug){ return _categories().find(c => c.slug === slug); }
function getCategoryById(id){ return _categories().find(c => c.id === id); }

function getProductBySlug(slug){ return _products().find(p => p.slug === slug); }
function getProductById(id){ return _products().find(p => p.id === Number(id)); }

function getActiveProducts(){ return _products().filter(p => p.is_active); }

function getPrimaryPrice(product){
  return (product.sale_price && product.sale_price > 0) ? product.sale_price : product.base_price;
}

function unique(list){ return [...new Set(list)].filter(Boolean); }

function getVariantOptions(product){
  const colors = unique(product.variants.filter(v => v.active).map(v => v.color));
  const sizes  = unique(product.variants.filter(v => v.active).map(v => v.size));
  return { colors, sizes };
}

function findVariant(product, color, size){
  return product.variants.find(v => v.active && v.color === color && v.size === size) || null;
}

function getProductUrl(product){ return `product.html?slug=${encodeURIComponent(product.slug)}`; }
function getCategoryUrl(slug){ return `category.html?cat=${encodeURIComponent(slug)}`; }

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

// ---------------------------------------------------------------------------
// API: carregar catlogo real (quando USE_MOCK_DATA=false)
// ---------------------------------------------------------------------------

async function _fetchJson(url, {method='GET', body=null}={}){
  // Compat: mantemos a assinatura antiga, mas agora delegamos ao apiClient.
  if(String(method).toUpperCase() === 'POST'){
    return apiPost(url, body);
  }
  return apiGet(url);
}

async function _loadCatalogFromApi(){
  const base = String(LV.API_BASE_URL || '').replace(/\/+$/,'');
  const storeSlug = encodeURIComponent(LV.STORE_SLUG || STORE.slug || '');
  if(!base || !storeSlug) throw new Error('Missing API_BASE_URL/STORE_SLUG');

  const catsRaw = await _fetchJson(`${base}/public/${storeSlug}/categories`);
  const categories = Array.isArray(catsRaw) ? catsRaw : [];

  // slug por nome, com fallback determinstico.
  const usedCatSlugs = new Set();
  const normCategories = categories
    .filter(c => c && typeof c === 'object')
    .map(c => ({ id: Number(c.id), name: String(c.name || '').trim() }))
    .filter(c => c.id > 0 && c.name)
    .map(c => {
      let slug = _slugify(c.name);
      if(!slug) slug = _slugify(`${c.name}-${c.id}`);
      if(usedCatSlugs.has(slug)) slug = _slugify(`${slug}-${c.id}`);
      usedCatSlugs.add(slug);
      return { ...c, slug };
    });

  const catNameById = new Map(normCategories.map(c => [c.id, c.name]));

  // Produtos paginados (limit max=100)
  const allProducts = [];
  const limit = 100;
  for(let offset = 0; offset < 500; offset += limit){
    const page = await _fetchJson(`${base}/public/${storeSlug}/products?limit=${limit}&offset=${offset}`);
    const list = Array.isArray(page) ? page : [];
    allProducts.push(...list);
    if(list.length < limit) break;
  }

  const usedProdSlugs = new Set();
  const normProducts = allProducts
    .filter(p => p && typeof p === 'object')
    .map(p => {
      const id = Number(p.id);
      const name = String(p.name || '').trim();
      const base_price = Number(p.base_price || 0);
      const category_id = Number(p.category_id);
      const description = String(p.description || '');
      const image_url = _withFallbackImg(p.image_url);

      let slug = _slugify(name);
      if(!slug) slug = _slugify(`${name}-${id}`);
      if(usedProdSlugs.has(slug)) slug = _slugify(`${slug}-${id}`);
      usedProdSlugs.add(slug);

      const variantsRaw = Array.isArray(p.variants) ? p.variants : [];
      const variants = variantsRaw
        .filter(v => v && typeof v === 'object')
        .map(v => ({
          id: Number(v.id),
          sku: String(v.sku || '').trim(),
          color: String(v.color || '').trim() || 'Padro',
          size: String(v.size || '').trim() || 'nico',
          price: Number(v.price || base_price || 0),
          stock: Number(v.stock || 0),
          active: Boolean(v.active !== false),
        }))
        .filter(v => v.id > 0 && v.sku);

      return {
        id,
        store_id: STORE.id,
        category_id,
        category: catNameById.get(category_id) || '',
        slug,
        name,
        description,
        short_description: _shortDescription(description),
        brand: STORE.name || 'Loja',
        image_url,
        images: [image_url],
        base_price,
        sale_price: null,
        is_active: Boolean(p.is_active !== false),
        collections: null,
        variants: variants.length ? variants : [
          {
            id: 1,
            sku: `SKU-${id}`,
            color: 'Padro',
            size: 'nico',
            price: base_price,
            stock: 0,
            active: true,
          }
        ],
        rating_placeholder: { value: 4.7, count: 128 },
      };
    })
    .filter(p => p.id > 0 && p.name);

  return { categories: normCategories, products: normProducts };
}

// Funo pblica: garante catlogo disponvel.
async function ensureCatalogLoaded(){
  if(LV.USE_MOCK_DATA) return;
  if(_runtimeCatalog) return;
  if(!_runtimeCatalogPromise){
    _runtimeCatalogPromise = (async () => {
      _runtimeCatalog = await _loadCatalogFromApi();
      window.LV_RUNTIME_CATALOG = _runtimeCatalog; // debug
    })();
  }
  return _runtimeCatalogPromise;
}

// ---------------------------------------------------------------------------
// Exports (ES Modules)
// ---------------------------------------------------------------------------

export {
  STORE,
  formatBRL,
  getCategoryBySlug,
  getCategoryById,
  getProductBySlug,
  getProductById,
  getActiveProducts,
  getPrimaryPrice,
  getVariantOptions,
  findVariant,
  getProductUrl,
  getCategoryUrl,
  clamp,
  ensureCatalogLoaded,
};

// Compatibilidade: alguns scripts antigos usam globais.
window.STORE = STORE;
window.formatBRL = formatBRL;
window.getCategoryBySlug = getCategoryBySlug;
window.getCategoryById = getCategoryById;
window.getProductBySlug = getProductBySlug;
window.getProductById = getProductById;
window.getActiveProducts = getActiveProducts;
window.getPrimaryPrice = getPrimaryPrice;
window.getVariantOptions = getVariantOptions;
window.findVariant = findVariant;
window.getProductUrl = getProductUrl;
window.getCategoryUrl = getCategoryUrl;
window.clamp = clamp;
window.ensureCatalogLoaded = ensureCatalogLoaded;

