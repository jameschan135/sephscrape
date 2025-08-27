const axios = require('axios');
const cheerio = require('cheerio');

// Helper: build ScrapeOps URL
function buildScrapeOpsUrl({ apiKey, targetUrl, country }) {
  const base = 'https://proxy.scrapeops.io/v1/';
  const params = new URLSearchParams({
    api_key: apiKey,
    url: targetUrl,
    render_js: 'true'
  });
  if (country) {
    params.set('country', country);
  }
  return `${base}?${params.toString()}`;
}

// Parse product from HTML
function parseProduct(html) {
  const $ = cheerio.load(html);

  // Price: look for price in specific CSS class
  const priceText = $('span.css-18jtttk > b.css-0').first().text().trim();
  
  // Product name: primary selector, with fallbacks
  let nameText = $('[data-at="product_name"]').first().text().trim();
  if (!nameText) {
    nameText = $('meta[property="og:title"]').attr('content')?.trim() || '';
  }
  if (!nameText) {
    nameText = $('h1').first().text().trim();
  }
  const safeName = nameText || null;

  // Brand: primary selector, with fallbacks
  let brandText = $('a[data-at="brand_name"]').first().text().trim();
  if (!brandText) {
    brandText = $('a[href*="/brand/"]').first().text().trim();
  }
  const safeBrand = brandText || null;

  // Check stock status using multiple methods for better accuracy
  const addToBasketButton = $('button[data-at="add_to_basket_btn"]');
  const hasButton = addToBasketButton.length > 0;
  
  const candidates = $('span:contains("Add to Basket")');
  const hasText = candidates.filter((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const hasAddToBasket = /Add to Basket/i.test(text);
    const hasGetItShippedChild = $(el).find('span:contains("Get It Shipped")').length > 0;
    return hasAddToBasket && (hasGetItShippedChild || true);
  }).length > 0;
  
  const inStock = hasButton || hasText;

  return {
    price: priceText || null,
    inStock,
    name: safeName,
    brand: safeBrand
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, apiKey, country } = req.body || {};
    if (!url || !apiKey) {
      return res.status(400).json({ error: 'Missing url or apiKey' });
    }

    const scrapeUrl = buildScrapeOpsUrl({ apiKey, targetUrl: url, country });
    const response = await axios.get(scrapeUrl, {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 60000
    });

    const { price, inStock, name, brand } = parseProduct(response.data);
    return res.json({ price, inStock, name, brand, sourceUrl: url });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    return res.status(status).json({ error: 'Scrape failed', details: message });
  }
}
