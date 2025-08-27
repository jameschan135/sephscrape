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

  const priceText = $('span.css-18jtttk > b.css-0').first().text().trim();
  
  let nameText = $('[data-at="product_name"]').first().text().trim();
  if (!nameText) {
    nameText = $('meta[property="og:title"]').attr('content')?.trim() || '';
  }
  if (!nameText) {
    nameText = $('h1').first().text().trim();
  }
  const safeName = nameText || null;

  let brandText = $('a[data-at="brand_name"]').first().text().trim();
  if (!brandText) {
    brandText = $('a[href*="/brand/"]').first().text().trim();
  }
  const safeBrand = brandText || null;

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

// Helper: process URLs in batches with concurrency limit
async function processBatch(urls, apiKey, country, concurrency = 3) {
  const results = new Array(urls.length);
  const queue = urls.map((url, index) => ({ url, index }));
  const inProgress = new Set();
  
  const processUrl = async (urlData) => {
    try {
      const { url, index } = urlData;
      const scrapeUrl = buildScrapeOpsUrl({ apiKey, targetUrl: url, country });
      const response = await axios.get(scrapeUrl, {
        headers: {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        timeout: 60000
      });
      
      const { price, inStock, name, brand } = parseProduct(response.data);
      results[index] = { url, price, inStock, name, brand, success: true };
    } catch (err) {
      const { url, index } = urlData;
      results[index] = { 
        url, 
        price: null, 
        inStock: null, 
        name: null, 
        brand: null, 
        success: false, 
        error: err.message 
      };
    }
  };

  const worker = async () => {
    while (queue.length > 0) {
      const urlData = queue.shift();
      if (!urlData) break;
      
      inProgress.add(urlData.url);
      await processUrl(urlData);
      inProgress.delete(urlData.url);
    }
  };

  const workers = Array(Math.min(concurrency, urls.length)).fill().map(() => worker());
  await Promise.all(workers);
  
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { urls, apiKey, country, concurrency = 3 } = req.body || {};
    if (!urls || !Array.isArray(urls) || urls.length === 0 || !apiKey) {
      return res.status(400).json({ error: 'Missing urls array or apiKey' });
    }

    const maxConcurrency = Math.min(Math.max(1, concurrency), 10);
    const results = await processBatch(urls, apiKey, country, maxConcurrency);
    
    return res.json({ 
      results, 
      total: urls.length, 
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
  } catch (err) {
    return res.status(500).json({ error: 'Batch scrape failed', details: err.message });
  }
}
