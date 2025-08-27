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

// Parse variants from HTML
function parseVariants(html, baseUrl) {
  const $ = cheerio.load(html);
  const variants = [];
  
  $('[data-comp="SwatchGroup "]').each((_, group) => {
    const $group = $(group);
    
    $group.find('button[data-at="swatch"], button[data-at="selected_swatch"]').each((_, button) => {
      const $button = $(button);
      const $img = $button.find('img');
      
      if ($img.length > 0) {
        const imageSrc = $img.attr('src');
        const ariaLabel = $button.attr('aria-label');
        
        if (imageSrc && ariaLabel) {
          const skuMatch = imageSrc.match(/sku\/(s\d+)/);
          if (skuMatch) {
            const sku = skuMatch[1].substring(1);
            const variantUrl = `${baseUrl}?skuId=${sku}`;
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
  
  let productName = $('[data-at="product_name"]').first().text().trim();
  if (!productName) {
    productName = $('meta[property="og:title"]').attr('content')?.trim() || '';
  }
  if (!productName) {
    productName = $('h1').first().text().trim();
  }
  
  return productName || 'Sephora Product';
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
}
