import React, { useState, useRef, useEffect } from 'react';
import { Play, Settings, Globe, Shield, Zap, AlertCircle, CheckCircle, FileSpreadsheet, Package } from 'lucide-react';
import axios from 'axios';
import '../styles/SephoraScraper.css';

const SephoraScraper = () => {
  const [activeTab, setActiveTab] = useState('urls'); // 'urls' | 'variants'
  const [proxyType, setProxyType] = useState('none');
  const [scrapeOpsKey, setScrapeOpsKey] = useState('');
  const [customProxies, setCustomProxies] = useState('');
  const [targetUrls, setTargetUrls] = useState('https://www.sephora.com/shop/makeup\nhttps://www.sephora.com/product/touchland-power-mist-hydrating-hand-sanitizer-P480529?skuId=2556751');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const logRef = useRef(null);

  // Variants scraper states
  const [variantUrl, setVariantUrl] = useState('');
  const [variantResults, setVariantResults] = useState([]);
  const [isVariantRunning, setIsVariantRunning] = useState(false);
  const [variantProgress, setVariantProgress] = useState(0);

  const STORAGE_KEY = 'sephoraScraperConfig';
  const [geo, setGeo] = useState('us'); // 'auto' | 'us'
  const [concurrency, setConcurrency] = useState(3); // 2, 3, 5, 10
  const [batchMode, setBatchMode] = useState(false); // true for batch processing

  // Load config on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.proxyType) setProxyType(saved.proxyType);
        if (typeof saved.scrapeOpsKey === 'string') setScrapeOpsKey(saved.scrapeOpsKey);
        if (typeof saved.customProxies === 'string') setCustomProxies(saved.customProxies);
        if (typeof saved.targetUrls === 'string') setTargetUrls(saved.targetUrls);
        if (saved.geo) setGeo(saved.geo);
        if (saved.concurrency) setConcurrency(saved.concurrency);
        if (typeof saved.batchMode === 'boolean') setBatchMode(saved.batchMode);
        if (typeof saved.variantUrl === 'string') setVariantUrl(saved.variantUrl);
      }
    } catch {}
  }, []);

  // Persist config on change
  useEffect(() => {
    try {
      const data = {
        proxyType,
        scrapeOpsKey,
        customProxies,
        targetUrls,
        geo,
        concurrency,
        batchMode,
        variantUrl
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, [proxyType, scrapeOpsKey, customProxies, targetUrls, geo, concurrency, batchMode, variantUrl]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const newLog = { timestamp, message, type };
    setLogs(prev => [...prev, newLog]);
  };

  const clearResults = () => {
    setResults([]);
    addLog('Đã xóa kết quả', 'info');
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const simulateScraping = async () => {
    setIsRunning(true);
    setResults([]);
    setLogs([]);
    setProgress(0);
    
    const urls = targetUrls.split(/\r?\n/).filter(url => url.trim() !== '');
    if (urls.length === 0) {
      addLog('Vui lòng nhập ít nhất một URL', 'warning');
      setIsRunning(false);
      return;
    }
    
    addLog('Khởi tạo scraper...', 'info');
    addLog(`Tổng số URL cần crawl: ${urls.length}`, 'info');
    
    switch(proxyType) {
      case 'scrapeops':
        addLog(`Kết nối ScrapeOps proxy với API key: ${scrapeOpsKey.substring(0, 8)}...`, 'success');
        break;
      case 'custom':
        const proxyCount = customProxies.split(/\r?\n/).filter(p => p.trim()).length;
        addLog(`Thiết lập ${proxyCount} proxy tùy chỉnh`, 'success');
        break;
      case 'none':
        addLog('Chạy không sử dụng proxy', 'warning');
        break;
      default:
        addLog('Loại proxy không xác định', 'warning');
        break;
    }

    const allProducts = [];
    
    for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
      const currentUrl = urls[urlIndex].trim();
      addLog(`Đang crawl URL ${urlIndex + 1}/${urls.length}: ${currentUrl}`, 'info');
      
      let productsFromUrl = [];
      if (proxyType === 'scrapeops') {
        if (batchMode) {
          // Batch mode: process all URLs at once
          if (urlIndex === 0) { // Only process once for all URLs
            try {
              addLog(`🚀 Bắt đầu Batch Mode: ${urls.length} URLs, concurrency ${concurrency}`, 'info');
              addLog(`📋 Danh sách SKUs: ${urls.map(url => url.includes('skuId') ? url.match(/skuId=(\d+)/)?.[1] : 'N/A').join(', ')}`, 'info');
              addLog(`⏳ Đang gọi backend ScrapeOps...`, 'info');
              
              const resp = await axios.post('/api/scrape/batch', {
                urls: urls,
                apiKey: scrapeOpsKey,
                country: geo === 'us' ? 'us' : undefined,
                concurrency: concurrency
              });
              
              if (resp.data.results && resp.data.results.length > 0) {
                addLog(`📥 Nhận được ${resp.data.results.length} kết quả từ backend`, 'info');
                addLog(`🔄 Bắt đầu xử lý kết quả...`, 'info');
                
                // Process all results - include both successful and failed
                for (let i = 0; i < resp.data.results.length; i++) {
                  const result = resp.data.results[i];
                  const currentSku = result.url.includes('skuId') ? result.url.match(/skuId=(\d+)/)?.[1] : null;
                  
                  // Log current processing status
                  addLog(`Đang xử lý ${i + 1}/${resp.data.results.length} - SKU: ${currentSku || 'N/A'}`, 'info');
                  
                  if (result.success) {
                    const { price, inStock, name, brand } = result;
                    const product = {
                      id: `${i}_1`,
                      name: name || 'Sephora Product',
                      brand: brand || 'Unknown',
                      price: price || '',
                      rating: 0,
                      reviews: 0,
                      url: result.url,
                      sku: currentSku,
                      inStock: Boolean(inStock),
                      originalIndex: i, // Keep track of original order
                      isError: false
                    };
                    allProducts.push(product);
                    setResults(prev => [...prev, product]);
                    addLog(`✅ SKU ${currentSku || 'N/A'}: ${name || 'Unknown'} - ${brand || 'Unknown'} - ${price || 'N/A'} - ${inStock ? 'In Stock' : 'Out of Stock'}`, 'success');
                  } else {
                    // Create error product entry to maintain order
                    const errorProduct = {
                      id: `${i}_1`,
                      name: 'Lỗi crawl dữ liệu',
                      brand: 'Lỗi crawl dữ liệu',
                      price: 'lỗi',
                      rating: 0,
                      reviews: 0,
                      url: result.url,
                      sku: currentSku,
                      inStock: 'lỗi',
                      originalIndex: i, // Keep track of original order
                      isError: true,
                      errorMessage: result.error
                    };
                    allProducts.push(errorProduct);
                    setResults(prev => [...prev, errorProduct]);
                    addLog(`❌ SKU ${currentSku || 'N/A'}: Lỗi parse - ${result.error}`, 'warning');
                  }
                  
                  // Update progress for each processed item
                  const progress = ((i + 1) / resp.data.results.length) * 100;
                  setProgress(progress);
                  
                  // Small delay to show real-time progress
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
                
                // Skip the rest of the loop since we processed all URLs
                addLog(`🎉 Batch crawl hoàn tất!`, 'success');
                addLog(`📊 Tổng kết: ${allProducts.length} sản phẩm`, 'success');
                addLog(`✅ Thành công: ${allProducts.filter(p => !p.isError).length}`, 'success');
                addLog(`❌ Lỗi: ${allProducts.filter(p => p.isError).length}`, 'warning');
                setIsRunning(false);
                return;
              }
            } catch (err) {
              addLog(`💥 Lỗi gọi ScrapeOps batch: ${err.response?.data?.error || err.message}`, 'warning');
              // Fall back to sequential processing
              addLog('🔄 Chuyển sang chế độ tuần tự...', 'info');
            }
          }
        }
        
        // Sequential mode or fallback
        try {
          const currentSku = currentUrl.includes('skuId') ? currentUrl.match(/skuId=(\d+)/)?.[1] : null;
          addLog(`🔄 Sequential Mode: URL ${urlIndex + 1}/${urls.length} - SKU: ${currentSku || 'N/A'}`, 'info');
          const resp = await axios.post('/api/scrape/batch', {
            urls: [currentUrl],
            apiKey: scrapeOpsKey,
            country: geo === 'us' ? 'us' : undefined,
            concurrency: 1
          });
          
          if (resp.data.results && resp.data.results.length > 0) {
            const result = resp.data.results[0];
            if (result.success) {
              const { price, inStock, name, brand } = result;
              productsFromUrl = [
                {
                  id: `${urlIndex}_1`,
                  name: name || 'Sephora Product',
                  brand: brand || 'Unknown',
                  price: price || '',
                  rating: 0,
                  reviews: 0,
                  url: currentUrl,
                  sku: currentUrl.includes('skuId') ? currentUrl.match(/skuId=(\d+)/)?.[1] : null,
                  inStock: Boolean(inStock),
                  originalIndex: urlIndex,
                  isError: false
                }
              ];
              addLog(`Parsed từ backend: name="${name || ''}", brand="${brand || ''}", price="${price || ''}", stock=${inStock ? 'In' : 'Out'}`, 'info');
            } else {
              // Create error product entry to maintain order
              const errorProduct = {
                id: `${urlIndex}_1`,
                name: 'Lỗi crawl dữ liệu',
                brand: 'Lỗi crawl dữ liệu',
                price: 'lỗi',
                rating: 0,
                reviews: 0,
                url: currentUrl,
                sku: currentUrl.includes('skuId') ? currentUrl.match(/skuId=(\d+)/)?.[1] : null,
                inStock: 'lỗi',
                originalIndex: urlIndex,
                isError: true,
                errorMessage: result.error
              };
              productsFromUrl = [errorProduct];
              addLog(`Lỗi parse URL ${currentUrl}: ${result.error} - Đã ghi vào kết quả với thông báo lỗi`, 'warning');
            }
          } else {
            addLog(`Không có kết quả từ batch API cho URL ${currentUrl}`, 'warning');
            // Create error product entry when no results
            const errorProduct = {
              id: `${urlIndex}_1`,
              name: 'Lỗi crawl dữ liệu',
              brand: 'Lỗi crawl dữ liệu',
              price: 'lỗi',
              rating: 0,
              reviews: 0,
              url: currentUrl,
              sku: currentUrl.includes('skuId') ? currentUrl.match(/skuId=(\d+)/)?.[1] : null,
              inStock: 'lỗi',
              originalIndex: urlIndex,
              isError: true,
              errorMessage: 'Không có kết quả từ API'
            };
            productsFromUrl = [errorProduct];
          }
        } catch (err) {
          addLog(`Lỗi gọi ScrapeOps tuần tự: ${err.response?.data?.error || err.message}`, 'warning');
          // Create error product entry when API call fails
          const errorProduct = {
            id: `${urlIndex}_1`,
            name: 'Lỗi crawl dữ liệu',
            brand: 'Lỗi crawl dữ liệu',
            price: 'lỗi',
            rating: 0,
            reviews: 0,
            url: currentUrl,
            sku: currentUrl.includes('skuId') ? currentUrl.match(/skuId=(\d+)/)?.[1] : null,
            inStock: 'lỗi',
            originalIndex: urlIndex,
            isError: true,
            errorMessage: err.response?.data?.error || err.message
          };
          productsFromUrl = [errorProduct];
        }
      } else {
        productsFromUrl = [
          {
            id: `${urlIndex}_1`,
            name: urlIndex === 0 ? 'Rare Beauty Soft Pinch liquid Blush' : 'Touchland Power Mist Hydrating Hand Sanitizer',
            brand: urlIndex === 0 ? 'Rare Beauty by Selena Gomez' : 'Touchland',
            price: urlIndex === 0 ? '$20.00' : '$12.00',
            rating: urlIndex === 0 ? 4.5 : 4.7,
            reviews: urlIndex === 0 ? 15420 : 892,
            url: currentUrl,
            sku: currentUrl.includes('skuId') ? currentUrl.match(/skuId=(\d+)/)?.[1] : null,
            inStock: true,
            originalIndex: urlIndex,
            isError: false
          }
        ];
      }
      
      for (let productIndex = 0; productIndex < productsFromUrl.length; productIndex++) {
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const totalProducts = urls.length * productsFromUrl.length;
        const currentProductIndex = (urlIndex * productsFromUrl.length) + productIndex;
        const progress = ((currentProductIndex + 1) / totalProducts) * 100;
        setProgress(progress);
        
        const product = productsFromUrl[productIndex];
        addLog(`Crawl thành công: ${product.name}${product.sku ? ` (SKU: ${product.sku})` : ''}`, 'success');
        
        allProducts.push(product);
        setResults(prev => [...prev, product]);
      }
      
      const currentSku = currentUrl.includes('skuId') ? currentUrl.match(/skuId=(\d+)/)?.[1] : null;
      addLog(`✅ Hoàn thành URL ${urlIndex + 1}/${urls.length} - SKU: ${currentSku || 'N/A'}`, 'success');
    }

    addLog(`🎉 Crawl hoàn tất!`, 'success');
    addLog(`📊 Tổng kết: ${allProducts.length} sản phẩm từ ${urls.length} URL`, 'success');
    addLog(`✅ Thành công: ${allProducts.filter(p => !p.isError).length}`, 'success');
    addLog(`❌ Lỗi: ${allProducts.filter(p => p.isError).length}`, 'warning');
    setIsRunning(false);
  };

  const scrapeVariants = async () => {
    if (!variantUrl.trim()) {
      addLog('Vui lòng nhập URL sản phẩm', 'warning');
      return;
    }

    setIsVariantRunning(true);
    setVariantResults([]);
    setVariantProgress(0);
    addLog('Bắt đầu scrape variants...', 'info');

    try {
      // Extract base product URL and current SKU
      const urlObj = new URL(variantUrl);
      const currentSku = urlObj.searchParams.get('skuId');
      const baseUrl = variantUrl.split('?')[0];
      
      addLog(`URL cơ sở: ${baseUrl}`, 'info');
      addLog(`SKU hiện tại: ${currentSku}`, 'info');

      if (proxyType === 'scrapeops') {
        addLog('Sử dụng ScrapeOps proxy để scrape variants...', 'info');
        
        const response = await axios.post('/api/scrape/variants', {
          url: variantUrl,
          apiKey: scrapeOpsKey,
          country: geo === 'us' ? 'us' : undefined
        });

        if (response.data.success) {
          const { variants, productName } = response.data;
          addLog(`Tìm thấy ${variants.length} variants cho sản phẩm: ${productName}`, 'success');
          
          const variantData = variants.map((variant, index) => ({
            id: `variant_${index}`,
            sku: variant.sku,
            name: variant.name,
            url: variant.url,
            imageUrl: variant.imageUrl
          }));

          setVariantResults(variantData);
          addLog(`Đã lưu ${variantData.length} variants`, 'success');
        } else {
          addLog(`Lỗi scrape variants: ${response.data.error}`, 'warning');
        }
      } else {
        // Fallback to mock data for demo
        addLog('Chế độ demo - sử dụng dữ liệu mẫu', 'info');
        
        const mockVariants = [
          {
            id: 'variant_1',
            sku: '2556819',
            name: 'Beach Coco',
            url: `${baseUrl}?skuId=2556819`,
            imageUrl: 'https://www.sephora.com/productimages/sku/s2556819+sw-62.jpg'
          },
          {
            id: 'variant_2',
            sku: '2556793',
            name: 'Vanilla Blossom',
            url: `${baseUrl}?skuId=2556793`,
            imageUrl: 'https://www.sephora.com/productimages/sku/s2556793+sw-62.jpg'
          },
          {
            id: 'variant_3',
            sku: '2556751',
            name: 'Wild Watermelon',
            url: `${baseUrl}?skuId=2556751`,
            imageUrl: 'https://www.sephora.com/productimages/sku/s2556751+sw-62.jpg'
          },
          {
            id: 'variant_4',
            sku: '2611234',
            name: 'Pure Lavender',
            url: `${baseUrl}?skuId=2611234`,
            imageUrl: 'https://www.sephora.com/productimages/sku/s2611234+sw-62.jpg'
          },
          {
            id: 'variant_5',
            sku: '2559649',
            name: 'Blue Sandalwood',
            url: `${baseUrl}?skuId=2559649`,
            imageUrl: 'https://www.sephora.com/productimages/sku/s2559649+sw-62.jpg'
          }
        ];

        setVariantResults(mockVariants);
        addLog(`Demo: Đã tạo ${mockVariants.length} variants mẫu`, 'success');
      }
    } catch (error) {
      addLog(`Lỗi: ${error.message}`, 'warning');
    } finally {
      setIsVariantRunning(false);
      setVariantProgress(100);
    }
  };

  const exportVariantsToExcel = () => {
    if (variantResults.length === 0) return;
    
    // Get product name from first variant URL
    let productName = 'Sephora-Product';
    if (variantResults.length > 0) {
      try {
        const url = variantResults[0].url;
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        if (pathParts.length > 2) {
          productName = pathParts[2].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
      } catch (e) {
        productName = 'Sephora-Product';
      }
    }

    const headers = ['Mã SKU', 'Tên Variants', 'Link Sản Phẩm có SKU Liên Quan'];
    
    const csvContent = [
      headers.join(','),
      ...variantResults.map(variant => [
        `SE-${variant.sku}`,
        `"${variant.name}"`,
        `"${variant.url}"`
      ].join(','))
    ].join('\n');
    
    const BOM = '\uFEFF';
    const dataBlob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${productName}-variants.csv`;
    link.click();
    
    addLog(`Đã xuất ${variantResults.length} variants ra file Excel: ${productName}-variants.csv`, 'success');
  };

  const clearVariantResults = () => {
    setVariantResults([]);
    addLog('Đã xóa kết quả variants', 'info');
  };

  const exportData = () => {
    if (results.length === 0) return;
    
    // Sort results by original order to maintain URL input sequence
    const sortedResults = [...results].sort((a, b) => {
      if (a.originalIndex !== undefined && b.originalIndex !== undefined) {
        return a.originalIndex - b.originalIndex;
      }
      // Fallback to ID if no originalIndex
      return a.id.localeCompare(b.id);
    });
    
    const headers = ['SKU', 'Name', 'Brand', 'Price', 'Stock', 'Link'];
    
    const csvContent = [
      headers.join(','),
      ...sortedResults.map(product => [
        // Add "SE-" prefix to SKU if it exists
        product.sku ? `SE-${product.sku}` : '',
        `"${(product.name || '').replace(/"/g, '""')}"`,
        `"${(product.brand || '').replace(/"/g, '""')}"`,
        product.price || '',
        // Handle both boolean and string values for inStock
        product.isError ? product.inStock : (typeof product.inStock === 'boolean' ? (product.inStock ? 'In Stock' : 'Out of Stock') : ''),
        `"${product.url}"`
      ].join(','))
    ].join('\n');
    
    const BOM = '\uFEFF';
    const dataBlob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    // Change filename to "sephora-scraping-unix-timestamp"
    const unixTimestamp = Math.floor(Date.now() / 1000);
    link.download = `sephora-scraping-${unixTimestamp}.csv`;
    link.click();
    
    addLog(`Đã xuất ${results.length} sản phẩm ra file CSV theo thứ tự URLs!`, 'success');
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>Sephora Product Scraper</h1>
        <p>Công cụ crawl dữ liệu sản phẩm từ Sephora.com</p>
      </div>

      <div className="main-content">
        <div className="sidebar">
          <div className="config-panel">
            <div className="panel-header">
              <Settings size={20} />
              <h2>Cấu hình</h2>
            </div>

            <div className="form-group">
              <label>Loại Proxy</label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    value="none"
                    checked={proxyType === 'none'}
                    onChange={(e) => setProxyType(e.target.value)}
                  />
                  <span>Không sử dụng proxy</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    value="scrapeops"
                    checked={proxyType === 'scrapeops'}
                    onChange={(e) => setProxyType(e.target.value)}
                  />
                  <span>ScrapeOps Proxy</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    value="custom"
                    checked={proxyType === 'custom'}
                    onChange={(e) => setProxyType(e.target.value)}
                  />
                  <span>Proxy tùy chỉnh</span>
                </label>
              </div>
            </div>

            {proxyType === 'scrapeops' && (
              <>
                <div className="form-group">
                  <label>Vị trí địa lý</label>
                  <div className="radio-group">
                    <label className="radio-label">
                      <input
                        type="radio"
                        value="auto"
                        checked={geo === 'auto'}
                        onChange={(e) => setGeo(e.target.value)}
                      />
                      <span>Tự động</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        value="us"
                        checked={geo === 'us'}
                        onChange={(e) => setGeo(e.target.value)}
                      />
                      <span>Hoa Kỳ</span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label>Chế độ xử lý</label>
                  <div className="radio-group">
                    <label className="radio-label">
                      <input
                        type="radio"
                        value="false"
                        checked={!batchMode}
                        onChange={(e) => setBatchMode(e.target.value === 'true')}
                      />
                      <span>Tuần tự (1 link/lần)</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        value="true"
                        checked={batchMode}
                        onChange={(e) => setBatchMode(e.target.value === 'true')}
                      />
                      <span>Batch (xử lý song song)</span>
                    </label>
                  </div>
                </div>

                {batchMode && (
                  <div className="form-group">
                    <label>Số lượng xử lý đồng thời</label>
                    <div className="radio-group">
                      {[2, 3, 5, 10].map(num => (
                        <label key={num} className="radio-label">
                          <input
                            type="radio"
                            value={num}
                            checked={concurrency === num}
                            onChange={(e) => setConcurrency(Number(e.target.value))}
                          />
                          <span>{num}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {proxyType === 'scrapeops' && (
              <div className="form-group">
                <label>ScrapeOps API Key</label>
                <input
                  type="text"
                  value={scrapeOpsKey}
                  onChange={(e) => setScrapeOpsKey(e.target.value)}
                  placeholder="Nhập API key của bạn"
                />
              </div>
            )}

            {proxyType === 'custom' && (
              <div className="form-group">
                <label>Danh sách Proxy (mỗi dòng một proxy)</label>
                <textarea
                  value={customProxies}
                  onChange={(e) => setCustomProxies(e.target.value)}
                  rows="4"
                  placeholder="ip:port:username:password&#10;192.168.1.1:8080:user:pass"
                />
              </div>
            )}
          </div>

          <div className="status-panel">
            <h3>Trạng thái Proxy</h3>
            <div className="status-info">
              {proxyType === 'none' && 'Kết nối trực tiếp (không proxy)'}
              {proxyType === 'scrapeops' && `ScrapeOps ${scrapeOpsKey ? '✓' : '⚠️'}`}
              {proxyType === 'custom' && `${customProxies.split(/\r?\n/).filter(p => p.trim()).length} proxy được cấu hình`}
            </div>
          </div>
        </div>

        <div className="content">
          <div className="tab-navigation">
            <button 
              className={`tab-btn ${activeTab === 'urls' ? 'active' : ''}`}
              onClick={() => setActiveTab('urls')}
            >
              <Globe size={16} />
              Danh sách URL
            </button>
            <button 
              className={`tab-btn ${activeTab === 'variants' ? 'active' : ''}`}
              onClick={() => setActiveTab('variants')}
            >
              <Package size={16} />
              Variants Scraper
            </button>
          </div>

          {activeTab === 'urls' && (
            <>
              <div className="url-panel">
                <div className="panel-header">
                  <Globe size={20} />
                  <h2>Danh sách URL</h2>
                </div>
                
                <div className="form-group">
                  <label>Danh sách URL (mỗi dòng một URL)</label>
                  <textarea
                    value={targetUrls}
                    onChange={(e) => setTargetUrls(e.target.value)}
                    rows="6"
                    placeholder="https://www.sephora.com/product/example-P123456?skuId=1234567&#10;https://www.sephora.com/product/another-P789012?skuId=7890123"
                  />
                  <div className="url-count">
                    {targetUrls.split(/\r?\n/).filter(url => url.trim() !== '').length} URL được nhập
                  </div>
                </div>

                <button
                  onClick={simulateScraping}
                  disabled={isRunning}
                  className={`start-btn ${isRunning ? 'running' : ''}`}
                >
                  {isRunning ? (
                    <>
                      <div className="spinner" />
                      Đang chạy...
                    </>
                  ) : (
                    <>
                      <Play size={16} />
                      Bắt đầu Crawl
                    </>
                  )}
                </button>

                {isRunning && (
                  <div className="progress-section">
                    <div className="progress-info">
                      <span>Tiến độ</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="results-panel">
                <div className="panel-header">
                  <h2>Kết quả ({results.length} sản phẩm)</h2>
                  {results.length > 0 && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={exportData} className="export-btn">
                        <FileSpreadsheet size={16} />
                        Xuất CSV
                      </button>
                      <button onClick={clearResults} className="export-btn" style={{ background: '#ef4444' }}>
                        Xóa kết quả
                      </button>
                    </div>
                  )}
                </div>

                <div className="results-list">
                  {results.map((product) => (
                    <div key={product.id} className={`product-item ${product.isError ? 'error-product' : ''}`}>
                      <div className="product-header">
                        <h3 style={{ color: product.isError ? '#ef4444' : 'white' }}>{product.name}</h3>
                        <span className="price" style={{ color: product.isError ? '#ef4444' : '#34d399' }}>{product.price}</span>
                      </div>
                      <p className="brand" style={{ color: product.isError ? '#ef4444' : '#bfdbfe' }}>{product.brand}</p>
                      <div className="product-info">
                        <span className="rating">★ {product.rating}</span>
                        <span className="reviews">{product.reviews.toLocaleString()} reviews</span>
                        {product.sku && <span className="sku">SKU: {product.sku}</span>}
                        {product.isError ? (
                          <span className="sku" style={{ color: '#ef4444' }}>
                            {product.inStock}
                          </span>
                        ) : (
                          typeof product.inStock === 'boolean' && (
                            <span className="sku" style={{ color: product.inStock ? '#34d399' : '#ef4444' }}>
                              {product.inStock ? 'In Stock' : 'Out of Stock'}
                            </span>
                          )
                        )}
                      </div>
                      <div className="product-url">🔗 {product.url}</div>
                      {product.isError && product.errorMessage && (
                        <div className="error-message" style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '8px' }}>
                          Lỗi: {product.errorMessage}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {results.length === 0 && (
                    <div className="empty-state">
                      Chưa có dữ liệu. Nhấn "Bắt đầu Crawl" để bắt đầu.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'variants' && (
            <>
              <div className="variants-panel">
                <div className="panel-header">
                  <Package size={20} />
                  <h2>Scrape Variants</h2>
                </div>
                
                <div className="form-group">
                  <label>URL sản phẩm Sephora</label>
                  <input
                    type="text"
                    value={variantUrl}
                    onChange={(e) => setVariantUrl(e.target.value)}
                    placeholder="https://www.sephora.com/product/example-P123456?skuId=1234567"
                    className="url-input"
                  />
                  <div className="form-help">
                    Nhập URL sản phẩm Sephora để scrape tất cả variants có sẵn
                  </div>
                </div>

                <button
                  onClick={scrapeVariants}
                  disabled={isVariantRunning}
                  className={`start-btn ${isVariantRunning ? 'running' : ''}`}
                >
                  {isVariantRunning ? (
                    <>
                      <div className="spinner" />
                      Đang scrape...
                    </>
                  ) : (
                    <>
                      <Package size={16} />
                      Bắt đầu Scrape Variants
                    </>
                  )}
                </button>

                {isVariantRunning && (
                  <div className="progress-section">
                    <div className="progress-info">
                      <span>Tiến độ</span>
                      <span>{Math.round(variantProgress)}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${variantProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="variants-results-panel">
                <div className="panel-header">
                  <h2>Kết quả Variants ({variantResults.length} variants)</h2>
                  {variantResults.length > 0 && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={exportVariantsToExcel} className="export-btn">
                        <FileSpreadsheet size={16} />
                        Xuất Excel
                      </button>
                      <button onClick={clearVariantResults} className="export-btn" style={{ background: '#ef4444' }}>
                        Xóa kết quả
                      </button>
                    </div>
                  )}
                </div>

                <div className="variants-list">
                  {variantResults.map((variant) => (
                    <div key={variant.id} className="variant-item">
                      <div className="variant-image">
                        <img src={variant.imageUrl} alt={variant.name} />
                      </div>
                      <div className="variant-info">
                        <h3>{variant.name}</h3>
                        <div className="variant-details">
                          <span className="sku">SKU: SE-{variant.sku}</span>
                          <div className="variant-url">🔗 {variant.url}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {variantResults.length === 0 && (
                    <div className="empty-state">
                      Chưa có variants. Nhập URL sản phẩm và nhấn "Bắt đầu Scrape Variants".
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="logs-panel">
            <div className="panel-header">
              <h2>Nhật ký hoạt động</h2>
              <button onClick={clearLogs} className="export-btn" style={{ background: '#6b7280' }}>
                Xóa log
              </button>
            </div>
            <div ref={logRef} className="logs-container">
              {logs.map((log, index) => (
                <div key={index} className={`log-item ${log.type}`}>
                  <span className="timestamp">{log.timestamp}</span>
                  {log.type === 'success' && <CheckCircle size={12} />}
                  {log.type === 'warning' && <AlertCircle size={12} />}
                  {log.type === 'info' && <div className="info-dot" />}
                  <span className="message">{log.message}</span>
                </div>
              ))}
              
              {logs.length === 0 && (
                <div className="empty-logs">Nhật ký sẽ hiển thị tại đây...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SephoraScraper;