// Performance optimizations
(function() {
  'use strict';

  // Image lazy loading
  function initLazyLoading() {
    const images = document.querySelectorAll('img[data-src]');
    
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.add('loaded');
            imageObserver.unobserve(img);
          }
        });
      });

      images.forEach(img => {
        imageObserver.observe(img);
      });
    } else {
      // Fallback for older browsers
      images.forEach(img => {
        img.src = img.dataset.src;
        img.classList.add('loaded');
      });
    }
  }

  // Service Worker registration
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(registration => {
            console.log('SW registered: ', registration);
          })
          .catch(registrationError => {
            console.log('SW registration failed: ', registrationError);
          });
      });
    }
  }

  // Performance monitoring
  function initPerformanceMonitoring() {
    if ('performance' in window) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const perfData = performance.getEntriesByType('navigation')[0];
          const loadTime = perfData.loadEventEnd - perfData.loadEventStart;
          
          // Send to analytics if available
          if (typeof gtag !== 'undefined') {
            gtag('event', 'timing_complete', {
              name: 'load',
              value: Math.round(loadTime)
            });
          }
        }, 0);
      });
    }
  }

  // Preload critical resources
  function preloadCriticalResources() {
    const criticalLinks = [
      '/assets/css/style.css',
      '/assets/img/img.jpg'
    ];

    criticalLinks.forEach(href => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = href;
      link.as = href.includes('.css') ? 'style' : 'image';
      document.head.appendChild(link);
    });
  }

  // Initialize all performance features
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initLazyLoading();
      preloadCriticalResources();
    });
  } else {
    initLazyLoading();
    preloadCriticalResources();
  }

  // Initialize features that need to wait for load
  window.addEventListener('load', function() {
    registerServiceWorker();
    initPerformanceMonitoring();
  });
})(); 