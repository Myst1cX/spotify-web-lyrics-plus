// Simple test script to verify token extraction functionality
// This can be run in browser console on spotify.com to test

console.log('Testing Spotify Token Extraction...');

// Test function to check if interception is working
function testTokenInterception() {
  console.log('Setting up test token interception...');
  
  // Store original fetch
  const originalFetch = window.fetch;
  
  // Override fetch to test interception
  window.fetch = function(...args) {
    const [url, options] = args;
    
    console.log('Intercepted fetch to:', url);
    
    if (typeof url === 'string' && url.includes('spotify.com')) {
      console.log('Spotify request detected:', url);
      if (options && options.headers) {
        console.log('Headers:', options.headers);
      }
    }
    
    // Call original fetch
    return originalFetch.apply(this, args);
  };
  
  console.log('Fetch interceptor set up. Make some Spotify requests to test...');
}

// Test localStorage checking
function testLocalStorageCheck() {
  console.log('Checking localStorage for Spotify tokens...');
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes('spotify') || key.includes('token'))) {
      console.log('Found potential token key:', key);
      const value = localStorage.getItem(key);
      if (typeof value === 'string' && value.length > 20) {
        console.log('Key has substantial value (length:', value.length, ')');
      }
    }
  }
}

// Run tests
testTokenInterception();
testLocalStorageCheck();

console.log('Test setup complete. Check console for interception logs.');