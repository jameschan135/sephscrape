const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

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

// Parse price and stock from HTML
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
  // Method 1: Look for button with data-at="add_to_basket_btn"
  const addToBasketButton = $('button[data-at="add_to_basket_btn"]');
  const hasButton = addToBasketButton.length > 0;
  
  // Method 2: Look for text containing "Add to Basket" and optionally "Get It Shipped"
  const candidates = $('span:contains("Add to Basket")');
  const hasText = candidates.filter((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const hasAddToBasket = /Add to Basket/i.test(text);
    const hasGetItShippedChild = $(el).find('span:contains("Get It Shipped")').length > 0;
    return hasAddToBasket && (hasGetItShippedChild || true);
  }).length > 0;
  
  // Product is in stock if either method succeeds
  const inStock = hasButton || hasText;
  
  // Debug: log what we found for stock detection
  console.log(`Stock detection: button=${hasButton}, text=${hasText}, final=${inStock}`);

  return {
    price: priceText || null,
    inStock,
    name: safeName,
    brand: safeBrand
  };
}

// Parse variants from HTML
function parseVariants(html, baseUrl) {
  const $ = cheerio.load(html);
  const variants = [];
  
  // Find all SwatchGroup components
  $('[data-comp="SwatchGroup "]').each((_, group) => {
    const $group = $(group);
    
    // Find all swatch buttons within the group
    $group.find('button[data-at="swatch"], button[data-at="selected_swatch"]').each((_, button) => {
      const $button = $(button);
      const $img = $button.find('img');
      
      if ($img.length > 0) {
        const imageSrc = $img.attr('src');
        const ariaLabel = $button.attr('aria-label');
        
        if (imageSrc && ariaLabel) {
          // Extract SKU from image URL
          const skuMatch = imageSrc.match(/sku\/(s\d+)/);
          if (skuMatch) {
            const sku = skuMatch[1].substring(1); // Remove 's' prefix
            
            // Build variant URL
            const variantUrl = `${baseUrl}?skuId=${sku}`;
            
            // Clean up variant name (remove " - Selected" suffix if present)
            const variantName = ariaLabel.replace(/\s*-\s*Selected$/, '');
            
            variants.push({
              sku,
              name: variantName,
              url: variantUrl,
              imageUrl: imageSrc
            });
          }
        }
      }
    });
  });
  
  return variants;
}

// Parse product name from HTML
function parseProductName(html) {
  const $ = cheerio.load(html);
  
  // Try multiple selectors for product name
  let productName = $('[data-at="product_name"]').first().text().trim();
  if (!productName) {
    productName = $('meta[property="og:title"]').attr('content')?.trim() || '';
  }
  if (!productName) {
    productName = $('h1').first().text().trim();
  }
  
  return productName || 'Sephora Product';
}

// Helper: process URLs in batches with concurrency limit
async function processBatch(urls, apiKey, country, concurrency = 3) {
  const results = new Array(urls.length); // Pre-allocate array to maintain order
  const queue = urls.map((url, index) => ({ url, index })); // Keep track of original positions
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

  // Start workers
  const workers = Array(Math.min(concurrency, urls.length)).fill().map(() => worker());
  await Promise.all(workers);
  
  return results;
}

// POST /api/scrape { url: string, apiKey: string }
app.post('/api/scrape', async (req, res) => {
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
});

// POST /api/scrape/batch { urls: string[], apiKey: string, country?: string, concurrency?: number }
app.post('/api/scrape/batch', async (req, res) => {
  try {
    const { urls, apiKey, country, concurrency = 3 } = req.body || {};
    if (!urls || !Array.isArray(urls) || urls.length === 0 || !apiKey) {
      return res.status(400).json({ error: 'Missing urls array or apiKey' });
    }

    const maxConcurrency = Math.min(Math.max(1, concurrency), 10); // Limit to 1-10
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
});

// POST /api/scrape/variants { url: string, apiKey: string, country?: string }
app.post('/api/scrape/variants', async (req, res) => {
  try {
    const { url, apiKey, country } = req.body || {};
    if (!url || !apiKey) {
      return res.status(400).json({ error: 'Missing url or apiKey' });
    }

    // Extract base URL without query parameters
    const baseUrl = url.split('?')[0];
    
    const scrapeUrl = buildScrapeOpsUrl({ apiKey, targetUrl: url, country });
    const response = await axios.get(scrapeUrl, {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 60000
    });

    const variants = parseVariants(response.data, baseUrl);
    const productName = parseProductName(response.data);
    
    if (variants.length === 0) {
      return res.json({ 
        success: false, 
        error: 'Không tìm thấy variants cho sản phẩm này',
        variants: [],
        productName
      });
    }
    
    return res.json({ 
      success: true, 
      variants, 
      productName,
      total: variants.length
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    return res.status(status).json({ 
      success: false,
      error: 'Scrape variants failed', 
      details: message 
    });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});


