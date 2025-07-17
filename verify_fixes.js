// Verification script for observer fixes
// This tests the key functions in isolation

// Mock DOM elements for testing
function createMockDOM() {
    // Clear any existing mock elements
    const existing = document.querySelectorAll('[data-mock="true"]');
    existing.forEach(el => el.remove());
    
    // Create mock shuffle button
    const shuffleBtn = document.createElement('button');
    shuffleBtn.setAttribute('aria-label', 'Enable shuffle');
    shuffleBtn.setAttribute('data-mock', 'true');
    shuffleBtn.id = 'mock-shuffle-test';
    document.body.appendChild(shuffleBtn);
    
    // Create mock repeat button
    const repeatBtn = document.createElement('button');
    repeatBtn.setAttribute('data-testid', 'control-button-repeat');
    repeatBtn.setAttribute('aria-label', 'Enable repeat');
    repeatBtn.setAttribute('aria-checked', 'false');
    repeatBtn.setAttribute('data-mock', 'true');
    repeatBtn.id = 'mock-repeat-test';
    document.body.appendChild(repeatBtn);
    
    // Create mock play/pause button
    const playPauseBtn = document.createElement('button');
    playPauseBtn.setAttribute('data-testid', 'control-button-playpause');
    playPauseBtn.setAttribute('aria-label', 'Play');
    playPauseBtn.setAttribute('data-mock', 'true');
    playPauseBtn.id = 'mock-playpause-test';
    document.body.appendChild(playPauseBtn);
    
    return { shuffleBtn, repeatBtn, playPauseBtn };
}

// Test button finding functions
function testButtonFinding() {
    console.log('🧪 Testing button finding functions...');
    
    const { shuffleBtn, repeatBtn, playPauseBtn } = createMockDOM();
    
    // Test shuffle button finding
    const foundShuffle = findSpotifyShuffleButton();
    console.log('Shuffle button found:', foundShuffle && foundShuffle.id === 'mock-shuffle-test');
    
    // Test repeat button finding  
    const foundRepeat = findSpotifyRepeatButton();
    console.log('Repeat button found:', foundRepeat && foundRepeat.id === 'mock-repeat-test');
    
    // Test play/pause button finding
    const foundPlayPause = findSpotifyPlayPauseButton();
    console.log('Play/Pause button found:', foundPlayPause && foundPlayPause.id === 'mock-playpause-test');
    
    // Test state changes
    shuffleBtn.setAttribute('aria-label', 'Enable smart shuffle');
    const foundShuffleChanged = findSpotifyShuffleButton();
    console.log('Shuffle button found after state change:', foundShuffleChanged && foundShuffleChanged.id === 'mock-shuffle-test');
    
    console.log('✅ Button finding tests completed');
}

// Test observer attachment (without actual observations)
function testObserverAttachment() {
    console.log('🧪 Testing observer attachment...');
    
    createMockDOM();
    
    // Create mock popup object
    const mockPopup = {
        _shuffleBtn: { button: document.createElement('button'), iconWrapper: document.createElement('span') },
        _repeatBtn: { button: document.createElement('button'), iconWrapper: document.createElement('span') },
        _playPauseBtn: { button: document.createElement('button'), iconWrapper: document.createElement('span') }
    };
    
    // Mock the update functions to avoid errors
    window.updateShuffleButton = () => console.log('updateShuffleButton called');
    window.updateRepeatButton = () => console.log('updateRepeatButton called'); 
    window.updatePlayPauseButton = () => console.log('updatePlayPauseButton called');
    
    try {
        // Test observer functions
        observeSpotifyShuffle(mockPopup);
        console.log('Shuffle observer attached:', !!mockPopup._shuffleObserver);
        
        observeSpotifyRepeat(mockPopup);
        console.log('Repeat observer attached:', !!mockPopup._repeatObserver);
        
        observeSpotifyPlayPause(mockPopup);
        console.log('Play/Pause observer attached:', !!mockPopup._playPauseObserver);
        
        // Test node tracking
        console.log('Current shuffle node tracked:', !!mockPopup._currentShuffleNode);
        console.log('Current repeat node tracked:', !!mockPopup._currentRepeatNode);
        console.log('Current play/pause node tracked:', !!mockPopup._currentPlayPauseNode);
        
        // Cleanup
        if (mockPopup._shuffleObserver) mockPopup._shuffleObserver.disconnect();
        if (mockPopup._shuffleNodeObserver) mockPopup._shuffleNodeObserver.disconnect();
        if (mockPopup._repeatObserver) mockPopup._repeatObserver.disconnect();
        if (mockPopup._repeatNodeObserver) mockPopup._repeatNodeObserver.disconnect();
        if (mockPopup._playPauseObserver) mockPopup._playPauseObserver.disconnect();
        if (mockPopup._playPauseNodeObserver) mockPopup._playPauseNodeObserver.disconnect();
        
        console.log('✅ Observer attachment tests completed');
        
    } catch (error) {
        console.error('❌ Observer attachment test failed:', error.message);
    }
}

// Test DOM replacement simulation
function testDOMReplacement() {
    console.log('🧪 Testing DOM replacement handling...');
    
    const { shuffleBtn } = createMockDOM();
    const parent = shuffleBtn.parentElement;
    
    // Create mock popup
    const mockPopup = {
        _shuffleBtn: { button: document.createElement('button'), iconWrapper: document.createElement('span') }
    };
    
    window.updateShuffleButton = () => console.log('updateShuffleButton called after replacement');
    
    let reattachCalled = false;
    const originalObserveFunction = observeSpotifyShuffle;
    
    // Override observe function to track re-attachment
    window.observeSpotifyShuffle = function(popup) {
        reattachCalled = true;
        return originalObserveFunction(popup);
    };
    
    try {
        // Attach observer
        observeSpotifyShuffle(mockPopup);
        
        // Simulate DOM replacement
        const newShuffleBtn = document.createElement('button');
        newShuffleBtn.setAttribute('aria-label', 'Enable shuffle');
        newShuffleBtn.setAttribute('data-mock', 'true');
        newShuffleBtn.id = 'mock-shuffle-replacement';
        
        // Remove old button
        shuffleBtn.remove();
        
        // Add new button
        parent.appendChild(newShuffleBtn);
        
        // Give observers time to detect change
        setTimeout(() => {
            console.log('DOM replacement detection working:', reattachCalled);
            console.log('✅ DOM replacement tests completed');
            
            // Cleanup
            if (mockPopup._shuffleObserver) mockPopup._shuffleObserver.disconnect();
            if (mockPopup._shuffleNodeObserver) mockPopup._shuffleNodeObserver.disconnect();
            
            // Restore original function
            window.observeSpotifyShuffle = originalObserveFunction;
        }, 100);
        
    } catch (error) {
        console.error('❌ DOM replacement test failed:', error.message);
    }
}

// Run all tests
function runVerificationTests() {
    console.log('🚀 Starting observer fixes verification...\n');
    
    testButtonFinding();
    console.log('');
    
    testObserverAttachment();
    console.log('');
    
    testDOMReplacement();
    
    console.log('\n🎉 Verification completed!');
}

// Auto-run if in browser environment
if (typeof window !== 'undefined') {
    runVerificationTests();
}