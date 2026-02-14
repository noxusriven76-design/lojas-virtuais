/*
  Catálogo local (mock) + carregamento opcional via API.

  Objetivo:
  - Mock NÃO é a fonte principal (desativado por padrão em assets/js/config.js)
  - Quando USE_MOCK_DATA=false, categorias/produtos vêm do backend no contexto do STORE_SLUG.

  Observação:
  - O backend atual não possui campos de "slug" no modelo, então o front gera slugs
    determinísticos (slugify(name + '-' + id)) para manter URLs estáveis.
*/

import { LV_CONFIG } from './config.js';
import { apiGet, apiPost } from './core/apiClient.js';

const LV = (window.LV_CONFIG || LV_CONFIG || { STORE_SLUG: 'roupas', API_BASE_URL: 'http://localhost:8000/api/v1', USE_MOCK_DATA: false });

const STORE = { id: 1, slug: LV.STORE_SLUG, name: 'Ninho Forte Agro', legalName: 'Ninho Forte Agro LTDA', url: 'https://www.sualoja.com', currency: 'BRL', country: 'BR' };

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
  if(!d) return 'Produto selecionado — confira detalhes e variações disponíveis.';
  return d.length > 120 ? (d.slice(0, 117) + '...') : d;
}
const CATEGORIES = [
  { id: 1, name: 'Gaiolas', slug: 'gaiolas' },
  { id: 2, name: 'Racao', slug: 'racao' },
  { id: 3, name: 'Acessorios para aves', slug: 'acessorios-aves' },
  { id: 4, name: 'Vitaminas', slug: 'vitaminas' },
  { id: 5, name: 'Novidades', slug: 'novidades' },
  { id: 6, name: 'Promocoes', slug: 'promocoes' }
];

const PRODUCTS = [
  {
    id: 1,
    store_id: 1,
    category_id: 1,
    category: 'Gaiolas',
    slug: 'gaiola-viveiro-galvanizada-60cm',
    name: 'Gaiola Viveiro Galvanizada 60cm',
    description: 'Gaiola resistente para passarinhos de pequeno e medio porte, com bandeja removivel e pintura anticorrosiva.',
    short_description: 'Viveiro robusto com limpeza facil e boa ventilacao.',
    brand: 'Ninho Forte',
    image_url: 'assets/img/products/p01.svg',
    images: ['assets/img/products/p01.svg','assets/img/products/p01.svg','assets/img/products/p01.svg'],
    base_price: 289.9,
    sale_price: null,
    is_active: true,
    collections: { novidades: true, mais_vendidos: true, promocoes: false },
    variants: [
      { id: 101, sku: 'NF-GAI-60-UNI', color: 'Verde musgo', size: 'Unico', price: 289.9, stock: 15, active: true }
    ],
    rating_placeholder: { value: 4.8, count: 96 }
  },
  {
    id: 2,
    store_id: 1,
    category_id: 1,
    category: 'Gaiolas',
    slug: 'gaiola-com-pedestal-rodizio',
    name: 'Gaiola com Pedestal e Rodizio',
    description: 'Modelo completo com pedestal e rodinhas para facilitar mudanca de ambiente sem estresse para a ave.',
    short_description: 'Gaiola com mobilidade para uso interno e varanda.',
    brand: 'Ninho Forte',
    image_url: 'assets/img/products/p02.svg',
    images: ['assets/img/products/p02.svg','assets/img/products/p02.svg','assets/img/products/p02.svg'],
    base_price: 379.9,
    sale_price: 349.9,
    is_active: true,
    collections: { novidades: false, mais_vendidos: true, promocoes: true },
    variants: [
      { id: 102, sku: 'NF-GAI-PED-UNI', color: 'Preto', size: 'Unico', price: 349.9, stock: 10, active: true }
    ],
    rating_placeholder: { value: 4.7, count: 81 }
  },
  {
    id: 3,
    store_id: 1,
    category_id: 2,
    category: 'Racao',
    slug: 'racao-mistura-sementes-premium-5kg',
    name: 'Racao Mistura de Sementes Premium 5kg',
    description: 'Blend com alpiste, painco e aveia para rotina alimentar equilibrada de canarios, calopsitas e periquitos.',
    short_description: 'Mistura premium de sementes para uso diario.',
    brand: 'Campo Vivo',
    image_url: 'assets/img/products/p03.svg',
    images: ['assets/img/products/p03.svg','assets/img/products/p03.svg','assets/img/products/p03.svg'],
    base_price: 84.9,
    sale_price: null,
    is_active: true,
    collections: { novidades: true, mais_vendidos: true, promocoes: false },
    variants: [
      { id: 103, sku: 'CV-RAC-PRE-5KG', color: 'Natural', size: '5kg', price: 84.9, stock: 42, active: true }
    ],
    rating_placeholder: { value: 4.9, count: 154 }
  },
  {
    id: 4,
    store_id: 1,
    category_id: 2,
    category: 'Racao',
    slug: 'racao-extrusada-calopsita-1kg',
    name: 'Racao Extrusada Calopsita 1kg',
    description: 'Pellets extrusados com vitaminas e minerais para aves de companhia, com boa aceitacao e digestibilidade.',
    short_description: 'Nutricao completa para calopsitas e aves similares.',
    brand: 'Campo Vivo',
    image_url: 'assets/img/products/p04.svg',
    images: ['assets/img/products/p04.svg','assets/img/products/p04.svg','assets/img/products/p04.svg'],
    base_price: 32.9,
    sale_price: 29.9,
    is_active: true,
    collections: { novidades: false, mais_vendidos: false, promocoes: true },
    variants: [
      { id: 104, sku: 'CV-RAC-EXT-1KG', color: 'Natural', size: '1kg', price: 29.9, stock: 67, active: true }
    ],
    rating_placeholder: { value: 4.6, count: 63 }
  },
  {
    id: 5,
    store_id: 1,
    category_id: 3,
    category: 'Acessorios para aves',
    slug: 'kit-bebedouro-comedouro-automatico',
    name: 'Kit Bebedouro + Comedouro Automatico',
    description: 'Conjunto pratico com encaixe universal para facilitar reposicao de agua e alimento na gaiola.',
    short_description: 'Kit essencial para rotina de alimentacao e hidratacao.',
    brand: 'Ninho Forte',
    image_url: 'assets/img/products/p05.svg',
    images: ['assets/img/products/p05.svg','assets/img/products/p05.svg','assets/img/products/p05.svg'],
    base_price: 24.9,
    sale_price: null,
    is_active: true,
    collections: { novidades: false, mais_vendidos: true, promocoes: false },
    variants: [
      { id: 105, sku: 'NF-ACE-KIT-BC', color: 'Transparente', size: 'Unico', price: 24.9, stock: 120, active: true }
    ],
    rating_placeholder: { value: 4.7, count: 110 }
  },
  {
    id: 6,
    store_id: 1,
    category_id: 3,
    category: 'Acessorios para aves',
    slug: 'poleiro-madeira-natural-30cm',
    name: 'Poleiro Madeira Natural 30cm',
    description: 'Poleiro de madeira natural tratado, ideal para enriquecimento ambiental e descanso das aves.',
    short_description: 'Poleiro natural para conforto e comportamento saudavel.',
    brand: 'Ninho Forte',
    image_url: 'assets/img/products/p06.svg',
    images: ['assets/img/products/p06.svg','assets/img/products/p06.svg','assets/img/products/p06.svg'],
    base_price: 14.9,
    sale_price: null,
    is_active: true,
    collections: { novidades: true, mais_vendidos: false, promocoes: false },
    variants: [
      { id: 106, sku: 'NF-ACE-POL-30', color: 'Madeira', size: '30cm', price: 14.9, stock: 95, active: true }
    ],
    rating_placeholder: { value: 4.8, count: 57 }
  },
  {
    id: 7,
    store_id: 1,
    category_id: 4,
    category: 'Vitaminas',
    slug: 'suplemento-vitaminico-aves-100ml',
    name: 'Suplemento Vitaminico para Aves 100ml',
    description: 'Suplemento liquido para periodos de muda e reforco nutricional, com aplicacao na agua de bebida.',
    short_description: 'Vitamina liquida para reforco em fases exigentes.',
    brand: 'BioAve',
    image_url: 'assets/img/products/p07.svg',
    images: ['assets/img/products/p07.svg','assets/img/products/p07.svg','assets/img/products/p07.svg'],
    base_price: 21.9,
    sale_price: null,
    is_active: true,
    collections: { novidades: true, mais_vendidos: false, promocoes: false },
    variants: [
      { id: 107, sku: 'BA-VIT-100ML', color: 'Liquido', size: '100ml', price: 21.9, stock: 48, active: true }
    ],
    rating_placeholder: { value: 4.6, count: 41 }
  },
  {
    id: 8,
    store_id: 1,
    category_id: 4,
    category: 'Vitaminas',
    slug: 'suplemento-calcio-aves-60g',
    name: 'Suplemento de Calcio para Aves 60g',
    description: 'Formula em po para complementar calcio na dieta, com orientacao de uso em racao ou farinhada.',
    short_description: 'Reforco de calcio para saude ossea e qualidade de postura.',
    brand: 'BioAve',
    image_url: 'assets/img/products/p08.svg',
    images: ['assets/img/products/p08.svg','assets/img/products/p08.svg','assets/img/products/p08.svg'],
    base_price: 17.9,
    sale_price: 15.9,
    is_active: true,
    collections: { novidades: false, mais_vendidos: false, promocoes: true },
    variants: [
      { id: 108, sku: 'BA-CAL-60G', color: 'Po', size: '60g', price: 15.9, stock: 73, active: true }
    ],
    rating_placeholder: { value: 4.5, count: 36 }
  },
  {
    id: 9,
    store_id: 1,
    category_id: 1,
    category: 'Gaiolas',
    slug: 'gaiola-voadeira-tela-fina-80cm',
    name: 'Gaiola Voaderia Tela Fina 80cm',
    description: 'Modelo espacoso para aves pequenas com estrutura firme e travas reforcadas para seguranca no dia a dia.',
    short_description: 'Gaiola ampla para aves ativas e rotina mais confortavel.',
    brand: 'Ninho Forte',
    image_url: 'assets/img/products/p09.svg',
    images: ['assets/img/products/p09.svg','assets/img/products/p09.svg','assets/img/products/p09.svg'],
    base_price: 459.9,
    sale_price: null,
    is_active: true,
    collections: { novidades: false, mais_vendidos: true, promocoes: false },
    variants: [
      { id: 109, sku: 'NF-GAI-VOA-80', color: 'Cinza', size: '80cm', price: 459.9, stock: 8, active: true }
    ],
    rating_placeholder: { value: 4.9, count: 47 }
  },
  {
    id: 10,
    store_id: 1,
    category_id: 2,
    category: 'Racao',
    slug: 'racao-farinhada-ovos-1kg',
    name: 'Farinhada com Ovos 1kg',
    description: 'Complemento alimentar para periodos de reproducao e muda, com proteinas e energia para aves ornamentais.',
    short_description: 'Farinhada nutritiva para fases de maior demanda.',
    brand: 'Campo Vivo',
    image_url: 'assets/img/products/p10.svg',
    images: ['assets/img/products/p10.svg','assets/img/products/p10.svg','assets/img/products/p10.svg'],
    base_price: 28.9,
    sale_price: null,
    is_active: true,
    collections: { novidades: false, mais_vendidos: true, promocoes: false },
    variants: [
      { id: 110, sku: 'CV-RAC-FAR-1KG', color: 'Natural', size: '1kg', price: 28.9, stock: 64, active: true }
    ],
    rating_placeholder: { value: 4.7, count: 72 }
  }
];

function formatBRL(value){
  try { return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  catch(e){ return 'R$ ' + (Math.round(value*100)/100).toFixed(2).replace('.', ','); }
}

function _categories(){
  if(_runtimeCatalog && Array.isArray(_runtimeCatalog.categories)) return _runtimeCatalog.categories;
  return LV.USE_MOCK_DATA ? CATEGORIES : [];
}
function _products(){
  if(_runtimeCatalog && Array.isArray(_runtimeCatalog.products)) return _runtimeCatalog.products;
  return LV.USE_MOCK_DATA ? PRODUCTS : [];
}

function getCategoryBySlug(slug){ return _categories().find(c => c.slug === slug); }
function getCategoryById(id){ return _categories().find(c => c.id === id); }

function getProductBySlug(slug){ return _products().find(p => p.slug === slug); }
function getProductById(id){ return _products().find(p => p.id === Number(id)); }

function getActiveProducts(){ return _products().filter(p => p.is_active); }

function getPrimaryPrice(product){
  const sale = Number(product?.sale_price);
  const base = Number(product?.base_price);
  if(Number.isFinite(sale) && sale > 0) return sale;
  if(Number.isFinite(base) && base > 0) return base;

  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const variantPrices = variants
    .map(v => Number(v?.price))
    .filter(v => Number.isFinite(v) && v > 0);
  if(variantPrices.length) return Math.min(...variantPrices);

  return 0;
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
// API: carregar catálogo real (quando USE_MOCK_DATA=false)
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

  // slug por nome, com fallback determinístico.
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
          color: String(v.color || '').trim() || 'Padrão',
          size: String(v.size || '').trim() || 'Único',
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
            color: 'Padrão',
            size: 'Único',
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

// Função pública: garante catálogo disponível.
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

