// Enhanced Analytics and Tracking
(function() {
  'use strict';

  // Custom event tracking
  function trackCustomEvent(eventName, parameters = {}) {
    if (typeof gtag !== 'undefined') {
      gtag('event', eventName, parameters);
    }
    
    // Also send to console for debugging
    console.log('Event tracked:', eventName, parameters);
  }

  // Track page views with custom parameters
  function trackPageView() {
    const pageTitle = document.title;
    const pageUrl = window.location.href;
    const referrer = document.referrer;
    
    trackCustomEvent('page_view', {
      page_title: pageTitle,
      page_location: pageUrl,
      page_referrer: referrer
    });
  }

  // Track user engagement
  function trackEngagement() {
    let scrollDepth = 0;
    let timeOnPage = 0;
    const startTime = Date.now();
    
    // Track scroll depth
    window.addEventListener('scroll', function() {
      const scrollPercent = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
      if (scrollPercent > scrollDepth) {
        scrollDepth = scrollPercent;
        
        // Track at 25%, 50%, 75%, 100%
        if (scrollDepth >= 25 && scrollDepth < 50) {
          trackCustomEvent('scroll_depth', { depth: 25 });
        } else if (scrollDepth >= 50 && scrollDepth < 75) {
          trackCustomEvent('scroll_depth', { depth: 50 });
        } else if (scrollDepth >= 75 && scrollDepth < 100) {
          trackCustomEvent('scroll_depth', { depth: 75 });
        } else if (scrollDepth >= 100) {
          trackCustomEvent('scroll_depth', { depth: 100 });
        }
      }
    });
    
    // Track time on page
    window.addEventListener('beforeunload', function() {
      timeOnPage = Math.round((Date.now() - startTime) / 1000);
      trackCustomEvent('time_on_page', { seconds: timeOnPage });
    });
  }

  // Track link clicks
  function trackLinkClicks() {
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (link) {
        const href = link.href;
        const text = link.textContent.trim();
        const isExternal = link.hostname !== window.location.hostname;
        
        trackCustomEvent('link_click', {
          link_url: href,
          link_text: text,
          is_external: isExternal
        });
      }
    });
  }

  // Track theme changes
  function trackThemeChanges() {
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          const theme = document.documentElement.getAttribute('data-theme');
          trackCustomEvent('theme_change', { theme: theme });
        }
      });
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  }

  // Track performance metrics
  function trackPerformance() {
    if ('performance' in window) {
      window.addEventListener('load', function() {
        setTimeout(function() {
          const perfData = performance.getEntriesByType('navigation')[0];
          
          // Core Web Vitals
          const metrics = {
            dns_lookup: perfData.domainLookupEnd - perfData.domainLookupStart,
            tcp_connection: perfData.connectEnd - perfData.connectStart,
            server_response: perfData.responseEnd - perfData.requestStart,
            dom_loading: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
            page_load: perfData.loadEventEnd - perfData.loadEventStart,
            total_time: perfData.loadEventEnd - perfData.fetchStart
          };
          
          trackCustomEvent('performance_metrics', metrics);
        }, 0);
      });
    }
  }

  // Track user preferences
  function trackUserPreferences() {
    // Track preferred color scheme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    trackCustomEvent('user_preferences', {
      prefers_dark_mode: prefersDark,
      user_agent: navigator.userAgent,
      language: navigator.language
    });
  }

  // Initialize all tracking
  function initAnalytics() {
    trackPageView();
    trackEngagement();
    trackLinkClicks();
    trackThemeChanges();
    trackPerformance();
    trackUserPreferences();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAnalytics);
  } else {
    initAnalytics();
  }
})(); 