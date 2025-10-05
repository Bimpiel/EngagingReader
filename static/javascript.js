// DOM elements
const fileInput = document.getElementById("fileInput");
const outputDiv = document.getElementById("text-display");
const loadingOverlay = document.getElementById("loading-overlay");
const dropArea = document.getElementById("drop-area");

// Main speech synthesis variables  
let speechSynthesis = window.speechSynthesis || window.webkitSpeechSynthesis;
let mainSpeechUtterance = null;
let currentText = "";
let mainWords = [];
let mainCurrentWordIndex = 0;
let mainWordSpans = [];
let mainSpeechPaused = false;
let isMainSpeaking = false;
let preloadedVoice = null; // Pre-loaded voice to avoid async delays in Chrome

// Modal TTS variables
let modalSpeechUtterance = null;
let modalPlayBtn = document.getElementById("modalPlayBtn");
let modalPauseBtn = document.getElementById("modalPauseBtn");
let definitionModal = document.getElementById("definitionModal");
let definitionContent = document.getElementById("definitionTextContent");
let definitionWord = document.getElementById("definitionWord");
let modalWords = [];
let modalWordSpans = [];
let modalCurrentWordIndex = 0;
let modalSpeechPaused = false;
let isModalSpeaking = false;

// Modal keyboard navigation state
let modalFocusedWordIndex = -1;

// Track the word that was clicked for definition
let definedWordElement = null;
let definedWordIndex = -1;

// Keyboard navigation state
let focusedWordIndex = -1;
let paragraphBoundaries = []; // Array of {startIndex, endIndex, element} for each paragraph
let currentParagraphIndex = -1;

// Track if pause was manual (pause button) vs automatic (definition)
let isManuallyPaused = false;

// Speech control buttons
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");

// Speed control variables - unified speed for both main and modal
let speechRate = 0.9;

// Update button states and icons based on playing status
function updateButtonStates(isPlaying) {
    if (isPlaying) {
        // When playing: play button selected, pause button available
        playBtn.classList.add('playing');
        pauseBtn.classList.add('playing');
        playBtn.disabled = false; // Can still click to restart
        pauseBtn.disabled = false; // Can pause
    } else {
        // When paused/stopped: play button available, pause button selected
        playBtn.classList.remove('playing');
        pauseBtn.classList.remove('playing');
        playBtn.disabled = false; // Can play/resume
        pauseBtn.disabled = true; // Can't pause when not playing
    }
}

// Update modal button states and icons based on playing status
function updateModalButtonStates(isPlaying) {
    if (isPlaying) {
        // When playing: play button selected, pause button available
        modalPlayBtn.classList.add('playing');
        modalPauseBtn.classList.add('playing');
        modalPlayBtn.disabled = false; // Can still click to restart
        modalPauseBtn.disabled = false; // Can pause
    } else {
        // When paused/stopped: play button available, pause button selected
        modalPlayBtn.classList.remove('playing');
        modalPauseBtn.classList.remove('playing');
        modalPlayBtn.disabled = false; // Can play/resume
        modalPauseBtn.disabled = true; // Can't pause when not playing
    }
}

// Initialize voices when they become available
function loadVoices() {
    return new Promise((resolve) => {
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0) {
            resolve(voices);
        } else {
            speechSynthesis.onvoiceschanged = function() {
                const voices = speechSynthesis.getVoices();
                resolve(voices);
            };
        }
    });
}

// Get the best English voice available
async function getEnglishVoice() {
    const voices = await loadVoices();
    
    // Detect browser and platform
    const userAgent = navigator.userAgent;
    const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
    const isChrome = /chrome/i.test(userAgent) && !/edg/i.test(userAgent);
    const isWindows = /windows/i.test(userAgent);
    const isMac = /macintosh|mac os x/i.test(userAgent);
    
    // Platform and browser-specific voice preferences
    let preferredVoices = [];
    
    if (isSafari && isMac) {
        // Safari on Mac - prefer Alex, then high-quality Mac voices
        preferredVoices = [
            'Alex',               // Enhanced voice, excellent for Safari
            'Samantha',           // High-quality American voice
            'Aaron',              // Siri male US voice
            'Nicky',              // Siri female US voice
            'Allison'             // Enhanced quality voice
        ];
    } else if (isChrome && isWindows) {
        // Chrome on Windows - prefer Microsoft voices
        preferredVoices = [
            'Microsoft Zira',     // Windows 10/11 female voice
            'Microsoft David',    // Windows 10/11 male voice
            'Microsoft Mark',     // Windows male voice
            'Zira',              // Short name variant
            'David',             // Short name variant
            'Mark',              // Short name variant
            'Google US English', // Google voices in Chrome
            'Chrome OS US English',
            'Samantha',          // If Mac voices are available
            'Alex'               // If Mac voices are available
        ];
    } else if (isChrome && isMac) {
        // Chrome on Mac - prefer Mac voices with Chrome compatibility
        preferredVoices = [
            'Samantha',           // Often works better in Chrome than Alex
            'Alex',               // May work in Chrome on Mac
            'Aaron',              // Siri voices
            'Nicky',
            'Google US English',  // Google voices
            'Chrome OS US English'
        ];
    } else if (isChrome) {
        // Chrome on other platforms (Linux, etc.)
        preferredVoices = [
            'Google US English',
            'Chrome OS US English',
            'English United States',
            'en-US',
            'English',
            'Samantha',
            'Alex'
        ];
    } else {
        // Other browsers - use general preferences
        preferredVoices = [
            'Samantha',
            'Alex',
            'Aaron',
            'Nicky',
            'Microsoft Zira',
            'Microsoft David',
            'Google US English'
        ];
    }
    
    // Look for specific preferred voices by name (case-insensitive, partial matching)
    for (const voiceName of preferredVoices) {
        const voice = voices.find(v => {
            if (!v.name) return false;
            const voiceNameLower = v.name.toLowerCase();
            const preferredLower = voiceName.toLowerCase();
            
            // Check for exact match or if voice name contains the preferred name
            const nameMatch = voiceNameLower === preferredLower || 
                             voiceNameLower.includes(preferredLower) ||
                             preferredLower.includes(voiceNameLower);
            
            // Ensure it's an English voice
            const isEnglish = v.lang && (
                v.lang.startsWith('en-US') || v.lang.startsWith('en_US') ||
                v.lang.startsWith('en-') || v.lang.startsWith('en_') ||
                v.lang.toLowerCase().includes('english') ||
                v.lang.toLowerCase().includes('united states')
            );
            
            return nameMatch && isEnglish;
        });
        
        if (voice) {
                    return voice;
        }
    }
    
    // Fallback to language-based selection for English variants
    const preferredLanguageOrder = [
        'en-US', 'en_US', 'en-US-', 'en_US_',
        'en-GB', 'en_GB', 'en-AU', 'en-CA', 'en-IN',
        'en-US-male', 'en-US-female', 'en-GB-oxendict',
        'english', 'English'
    ];
    
    // Try to find exact matches by language
    for (const lang of preferredLanguageOrder) {
        const voice = voices.find(v => v.lang && v.lang.toLowerCase().includes(lang.toLowerCase()));
        if (voice) {
            return voice;
        }
    }
    
    // Look for any voice with "english" or "united states" in the name or language
    const englishVoice = voices.find(voice => {
        if (!voice.name && !voice.lang) return false;
        const searchText = ((voice.name || '') + ' ' + (voice.lang || '')).toLowerCase();
        return searchText.includes('english') || 
               searchText.includes('united states') ||
               searchText.includes('en-') ||
               searchText.includes('en_');
    });
    
    if (englishVoice) {
        return englishVoice;
    }
    
    // Last resort - first available voice
    return voices[0];
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Preload voices
    loadVoices();
    
    // Preload the best voice for immediate use (Chrome compatibility fix)
    setTimeout(async () => {
        try {
            preloadedVoice = await getEnglishVoice();
        } catch (error) {
            console.error('❌ Error preloading voice:', error);
        }
    }, 100);
    
    // Hide speech controls initially
    document.getElementById('speech-controls').style.display = 'none';
    
    // Add global keyboard event listener for spacebar
    document.addEventListener('keydown', handleGlobalKeydown);
    
    // Set up event listeners
    document.querySelector('.close-btn').addEventListener('click', closeDefinitionModal);
    window.addEventListener('click', function(event) {
        if (event.target === definitionModal) {
            closeDefinitionModal();
        }
    });

    // Add single-click event listener to output div for word selection
    outputDiv.addEventListener('click', handleWordSelection);

    // Add event listeners for modal TTS
    modalPlayBtn.addEventListener('click', handleModalPlayClick);
    modalPauseBtn.addEventListener('click', handleModalPauseClick);

    // Add event listeners for main TTS
    playBtn.addEventListener('click', handlePlayClick);
    pauseBtn.addEventListener('click', handlePauseClick);

    // Add event listeners for speed controls
    setupSpeedControl('speedDisplay', 'main');
    setupSpeedControl('modalSpeedDisplay', 'modal');

    // Drag and drop events
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.style.backgroundColor = '#D8E1D9';
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.style.backgroundColor = 'transparent';
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.style.backgroundColor = 'transparent';
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            uploadImage();
        }
    });

    // Keyboard accessibility for drop area
    dropArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click(); // Trigger file browser
        }
    });

    // Click event for drop area (for mouse users)
    dropArea.addEventListener('click', (e) => {
        // Only trigger if clicking the drop area itself, not the label button
        if (e.target === dropArea || e.target.closest('#drop-area') === dropArea) {
            if (!e.target.classList.contains('labBtn')) {
                fileInput.click();
            }
        }
    });

    // File input change
    fileInput.addEventListener('change', uploadImage);
});

// Setup speed control for a specific speed display element
function setupSpeedControl(displayId, context) {
    const speedDisplay = document.getElementById(displayId);
    if (!speedDisplay) return;
    
    const dropdown = speedDisplay.querySelector('.speed-dropdown');
    const speedOptions = speedDisplay.querySelectorAll('.speed-option:not(.speed-label)');
    
    // Toggle dropdown on click
    speedDisplay.addEventListener('click', function(event) {
        // Close other dropdowns first
        document.querySelectorAll('.speed-dropdown.show').forEach(otherDropdown => {
            if (otherDropdown !== dropdown) {
                otherDropdown.classList.remove('show');
                otherDropdown.parentElement.classList.remove('active');
            }
        });
        
        // Toggle this dropdown
        dropdown.classList.toggle('show');
        speedDisplay.classList.toggle('active');
        
        // Prevent event from bubbling to document
        event.stopPropagation();
    });
    
    // Handle speed option selection
    speedOptions.forEach(option => {
        option.addEventListener('click', function(event) {
            const speed = parseFloat(this.getAttribute('data-speed'));
            const speedText = this.textContent;
            
            // Update the unified speech rate
            speechRate = speed;
            
            // Update both main and modal displays
            const mainSpeedDisplay = document.getElementById('speedDisplay');
            const modalSpeedDisplay = document.getElementById('modalSpeedDisplay');
            
            [mainSpeedDisplay, modalSpeedDisplay].forEach(display => {
                if (display) {
                    const displayText = display.childNodes[0]; // Get the text node
                    if (displayText && displayText.nodeType === Node.TEXT_NODE) {
                        displayText.textContent = speedText;
                    }
                }
            });
            
            // Handle playback restart based on context
            if (context === 'main') {
                const wasPlaying = isMainSpeaking && !mainSpeechPaused;
                
                // If currently playing, restart from current word with new speed
                if (wasPlaying && mainCurrentWordIndex >= 0) {
                    // Set the defined word to current position for seamless restart
                    definedWordIndex = mainCurrentWordIndex;
                    // Stop current speech
                    speechSynthesis.cancel();
                    // Small delay to ensure clean restart
                    setTimeout(() => {
                        resumeFromDefinedWord();
                    }, 50);
                }
            } else if (context === 'modal') {
                const wasPlaying = isModalSpeaking && !modalSpeechPaused;
                const currentWordBeforeChange = modalCurrentWordIndex;
                
                // If currently playing, restart from current word with new speed
                if (wasPlaying && modalCurrentWordIndex >= 0) {
                    // Stop current speech
                    speechSynthesis.cancel();
                    // Restart from current position
                    setTimeout(() => {
                        restartModalFromWord(currentWordBeforeChange);
                    }, 50);
                }
            }
            
            // Close dropdown
            dropdown.classList.remove('show');
            speedDisplay.classList.remove('active');
            
            event.stopPropagation();
        });
    });
}

// Close all dropdowns when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.speed-display')) {
        document.querySelectorAll('.speed-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
            dropdown.parentElement.classList.remove('active');
        });
    }
});

// Upload and process image
async function uploadImage() {
    // Hide speech controls when starting new upload
    document.getElementById('speech-controls').style.display = 'none';
    
    if (!fileInput.files.length) {
        showError("Please select an image file first.");
        announceError("Please select a file first.");
        return;
    }

    const file = fileInput.files[0];

    // Validate file type - support images and PDFs
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.pdf'];
    
    // Check both MIME type and file extension (HEIC files might not have proper MIME type on all browsers)
    const fileName = file.name.toLowerCase();
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
    
    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
        showError("Please select a valid file (JPEG, PNG, HEIC, WebP, or PDF).");
        announceError("Invalid file type. Please select an image or PDF file.");
        return;
    }

    // Check file size (50MB limit - generous for high-quality documents)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
        showError("File size exceeds 50MB limit. Please choose a smaller file.");
        announceError("File too large. Please choose a file under 50MB.");
        return;
    }

    // Show loading state
    loadingOverlay.style.display = 'flex';
    outputDiv.innerHTML = "";
    announceStatus("Processing file, please wait...");

    try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to process image");
        }

        // Sanitize and render markdown
        const dirtyHtml = marked.parse(data.markdown || "");
        const cleanHtml = DOMPurify.sanitize(dirtyHtml);

        outputDiv.innerHTML = cleanHtml;

        // Immediately wrap words in spans for clickable definitions
        wrapWordsInSpans(outputDiv);

        // Initialize navigation system after words are wrapped
        initializeWordNavigation();

        // Enable play button and store the current text
        currentText = cleanHtml;
        
        // Set initial button states (not playing)
        updateButtonStates(false);

        // Show speech controls after successful processing
        document.getElementById('speech-controls').style.display = 'flex';

        // Hide upload container and show content
        document.getElementById('upload-container').style.display = 'none';
        
        announceStatus("Text extracted successfully. Use spacebar to start reading or tab to navigate words.");

    } catch (error) {
        showError(error.message);
        announceError("Failed to process file. Please try again.");
        // Keep speech controls hidden on error
        document.getElementById('speech-controls').style.display = 'none';
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

/**
 * Recursively finds text nodes within an element and wraps each word in a <span>.
 * @param {Node} node - The DOM node to process.
 */
function wrapWordsInSpans(node) {
    // Ignore nodes that aren't elements or text
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) {
        return;
    }

    // If it's a text node, wrap its words
    if (node.nodeType === Node.TEXT_NODE) {
        // Don't wrap empty/whitespace-only text nodes
        if (node.textContent.trim() === '') {
            return;
        }

        const fragment = document.createDocumentFragment();
        const words = node.textContent.split(/\s+/); // Split by whitespace

        words.forEach((word, index) => {
            if (word) {
                const span = document.createElement('span');
                span.className = 'word highlight-word';
                span.textContent = word;
                
                // Make word keyboard accessible with roving tabindex
                span.setAttribute('tabindex', '-1');
                span.setAttribute('role', 'button');
                span.setAttribute('aria-label', word);
                
                fragment.appendChild(span);
            }
            
            // Add a space back between words
            if (index < words.length - 1) {
                fragment.appendChild(document.createTextNode(' '));
            }
        });

        // Replace the original text node with the new fragment containing spans
        node.parentNode.replaceChild(fragment, node);
        return;
    }

    // If it's an element, recursively call this function on its children
    // We convert childNodes to an array because the collection is live and will be modified
    const children = Array.from(node.childNodes);
    children.forEach(child => wrapWordsInSpans(child));
}

// Highlight the current word being spoken in main content
function highlightCurrentWord(index) {
    // Remove current-word class from all words
    mainWordSpans.forEach(span => {
        span.classList.remove('current-word');
        span.classList.remove('highlight');
    });

    // Add current-word class to current word
    if (index >= 0 && index < mainWordSpans.length) {
        mainWordSpans[index].classList.add('current-word');
        mainWordSpans[index].classList.add('highlight');
        
        // Make keyboard focus follow the speaking word (don't remove speech highlights)
        setWordFocusFromSpeech(index);
    }
}

// Highlight the current word being spoken in definition modal
function highlightModalCurrentWord(index) {
    // Remove current-word class from all words
    modalWordSpans.forEach(span => {
        span.classList.remove('definition-current-word');
        span.classList.remove('highlight');
    });

    // Add current-word class to current word
    if (index >= 0 && index < modalWordSpans.length) {
        modalWordSpans[index].classList.add('definition-current-word');
        modalWordSpans[index].classList.add('highlight');
        
        // Make keyboard focus follow the speaking word in modal (same as main content)
        setModalWordFocusFromSpeech(index);
    }
}

// Stop all speech synthesis
function stopAllSpeech() {
    if (speechSynthesis.speaking || speechSynthesis.paused) {
        speechSynthesis.cancel();
    }
    // Don't immediately reset speaking states as the error handlers might need them
    // Let the individual functions handle their own state management
}

// Read the extracted text aloud with highlighting
function readText() {
    if (!currentText) {
        return;
    }

    // Stop any ongoing speech
    stopAllSpeech();
    mainCurrentWordIndex = 0;
    isMainSpeaking = true;
    
    // Reset defined word tracking since we're starting fresh
    definedWordElement = null;
    definedWordIndex = -1;
    isManuallyPaused = false;

    // 1. Get the plain text for the speech synthesis engine BEFORE modifying the DOM
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = currentText;
    const cleanText = tempDiv.textContent;

    // 2. Get all word spans for highlighting (words are already wrapped)
    mainWordSpans = Array.from(document.querySelectorAll('.highlight-word'));
    mainWords = mainWordSpans.map(span => span.textContent);

    // Chrome fix: Start a dummy utterance immediately to establish speech context
    const isChrome = /chrome/i.test(navigator.userAgent) && !/edg/i.test(navigator.userAgent);
    if (isChrome) {

        const dummyUtterance = new SpeechSynthesisUtterance('');
        dummyUtterance.volume = 0;
        speechSynthesis.speak(dummyUtterance);
    }

    // Create utterance
    mainSpeechUtterance = new SpeechSynthesisUtterance(cleanText);

    // Use preloaded voice (Chrome compatibility fix) or fallback
    if (preloadedVoice) {

        mainSpeechUtterance.voice = preloadedVoice;
        mainSpeechUtterance.lang = preloadedVoice.lang;
    } else {

        mainSpeechUtterance.lang = 'en-US';
        // Try to load voice asynchronously in background for next time
        getEnglishVoice().then(voice => {
            if (voice) preloadedVoice = voice;
        });
    }

    // Set rate to current selection
    mainSpeechUtterance.rate = speechRate;

    // Event handlers
    mainSpeechUtterance.onboundary = function(event) {
        if (event.name === 'word') {
            const charIndex = event.charIndex;
            let currentCharCount = 0;

            // Find which word we're at based on character index
            for (let i = 0; i < mainWords.length; i++) {
                currentCharCount += mainWords[i].length + (i === mainWords.length - 1 ? 0 : 1); // +1 for space except last word
                if (currentCharCount > charIndex) {
                    mainCurrentWordIndex = i;
                    highlightCurrentWord(i);
                    break;
                }
            }
        }
    };

    mainSpeechUtterance.onend = function() {

        isMainSpeaking = false;
        mainSpeechPaused = false;
        updateButtonStates(false);
        mainCurrentWordIndex = 0;
        highlightCurrentWord(-1);
        isManuallyPaused = false; // Reset manual pause flag
    };

    mainSpeechUtterance.onpause = function() {
        mainSpeechPaused = true;
        updateButtonStates(false); // Show as paused state
    };

    mainSpeechUtterance.onresume = function() {
        mainSpeechPaused = false;
        updateButtonStates(true); // Show as playing state
    };

    mainSpeechUtterance.onstart = function() {
        
        isMainSpeaking = true;
        updateButtonStates(true);
        
        // Clear ALL existing focus outlines when speech starts
        // Focus will now follow the speaking word automatically
        clearAllKeyboardFocus();
    };

    mainSpeechUtterance.onerror = function(event) {
        console.error('❌ Speech error:', event.error);
        
        // Ignore 'interrupted' and 'canceled' errors as they're expected when switching/resuming
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
            // Chrome fallback: try again with a fresh utterance
            if (isChrome && event.error !== 'not-allowed') {
    
                setTimeout(() => {
        
                    const retryUtterance = new SpeechSynthesisUtterance(cleanText);
                    retryUtterance.voice = mainSpeechUtterance.voice;
                    retryUtterance.lang = mainSpeechUtterance.lang;
                    retryUtterance.rate = mainSpeechUtterance.rate;
                    
                    // Copy main event handlers
                    retryUtterance.onboundary = mainSpeechUtterance.onboundary;
                    retryUtterance.onend = mainSpeechUtterance.onend;
                    retryUtterance.onstart = mainSpeechUtterance.onstart;
                    retryUtterance.onpause = mainSpeechUtterance.onpause;
                    retryUtterance.onresume = mainSpeechUtterance.onresume;
                    
                    speechSynthesis.speak(retryUtterance);
                    mainSpeechUtterance = retryUtterance; // Update reference
                }, 100);
            } else {
                console.error('Main SpeechSynthesis error (fallback failed):', event);
                isMainSpeaking = false;
                stopReading();
            }
        }
    };

    // Set button states for starting speech (will be updated by onstart event)
    updateButtonStates(true);

    // Start speaking




    
    // Chrome-specific: Try immediate start first if we have preloaded voice, then fallback to delayed
    if (isChrome) {
        if (preloadedVoice) {
    
            speechSynthesis.speak(mainSpeechUtterance);
    
            
            // Still monitor for silent failures
            setTimeout(() => {
                if (isMainSpeaking && !speechSynthesis.speaking) {
        
                    speechSynthesis.cancel();
                    setTimeout(() => {
                        speechSynthesis.speak(mainSpeechUtterance);
                    }, 50);
                }
            }, 200);
        } else {
    
            setTimeout(() => {
                speechSynthesis.speak(mainSpeechUtterance);
        
                
                // Set a timeout to detect if Chrome is ignoring the speech request
                setTimeout(() => {
                    if (isMainSpeaking && !speechSynthesis.speaking) {
            
                        speechSynthesis.cancel();
                        speechSynthesis.speak(mainSpeechUtterance);
                    }
                }, 500);
            }, 50);
        }
    } else {
        speechSynthesis.speak(mainSpeechUtterance);

    }
}

// Handle play button click - starts or resumes playback
function handlePlayClick() {

    
    if (!currentText) {

        return;
    }
    
    // If paused, resume
    if (mainSpeechUtterance && mainSpeechPaused) {

        resumeReading();
    } else if (isMainSpeaking) {
        // If already playing, restart from beginning

        stopReading();
        setTimeout(() => readText(), 100); // Small delay to ensure clean restart
    } else {
        // Start new playback

        readText();
    }
}

// Handle pause button click - pauses playback
function handlePauseClick() {

    
    if (isMainSpeaking && !mainSpeechPaused) {
        pauseReading();
    }
}

// Pause the main reading
function pauseReading() {
    if (mainSpeechUtterance && !mainSpeechPaused) {
        speechSynthesis.pause();
        isManuallyPaused = true; // Mark as manually paused

    }
}

// Auto-pause for definition (doesn't set manual pause flag)
function autoPauseForDefinition() {
    if (mainSpeechUtterance && !mainSpeechPaused) {
        speechSynthesis.pause();

    }
}

// Resume paused main reading
function resumeReading() {
    if (definedWordIndex >= 0 && mainWords && mainWords.length > 0) {
        // If there's a defined word, always prioritize resuming from that word

        resumeFromDefinedWord();
        isManuallyPaused = false; // Reset manual pause flag since we're overriding it
    } else if (isManuallyPaused) {
        // If manually paused (and no defined word), do regular resume

        if (mainSpeechUtterance && mainSpeechPaused) {
            speechSynthesis.resume();
            isManuallyPaused = false; // Reset manual pause flag
        }
    } else if (mainSpeechUtterance && mainSpeechPaused) {

        speechSynthesis.resume();
    }
}

// Stop main reading completely
function stopReading() {

    if (isMainSpeaking) {
        speechSynthesis.cancel();
        isMainSpeaking = false;
    }
    mainSpeechPaused = false;
    updateButtonStates(false);
    highlightCurrentWord(-1);
    
    // Reset defined word tracking
    definedWordElement = null;
    definedWordIndex = -1;
    isManuallyPaused = false;
}

// Resume reading from the defined word
async function resumeFromDefinedWord() {
    if (definedWordIndex < 0 || !mainWords || !mainWordSpans) {

        return;
    }

    // Only cancel speech if it's actually speaking, not if it's just paused
    if (speechSynthesis.speaking && !speechSynthesis.paused) {
        speechSynthesis.cancel();
    } else if (speechSynthesis.paused) {
        speechSynthesis.cancel();
    }
    
    // Set the current word index to the defined word
    mainCurrentWordIndex = definedWordIndex;
    isMainSpeaking = true;
    mainSpeechPaused = false;

    // Create text starting from the defined word
    const remainingWords = mainWords.slice(definedWordIndex);
    const textToSpeak = remainingWords.join(' ');

    // Create new utterance for the remaining text
    mainSpeechUtterance = new SpeechSynthesisUtterance(textToSpeak);

    // Get and set English voice
    const englishVoice = await getEnglishVoice();
    if (englishVoice) {
        mainSpeechUtterance.voice = englishVoice;
        mainSpeechUtterance.lang = englishVoice.lang;
    } else {
        mainSpeechUtterance.lang = 'en-US';
    }

    // Set rate to current selection
    mainSpeechUtterance.rate = speechRate;

    // Event handlers
    mainSpeechUtterance.onboundary = function(event) {
        if (event.name === 'word') {
            const charIndex = event.charIndex;
            let currentCharCount = 0;

            // Find which word we're at based on character index (relative to remaining words)
            for (let i = 0; i < remainingWords.length; i++) {
                currentCharCount += remainingWords[i].length + (i === remainingWords.length - 1 ? 0 : 1);
                if (currentCharCount > charIndex) {
                    mainCurrentWordIndex = definedWordIndex + i;
                    highlightCurrentWord(mainCurrentWordIndex);
                    break;
                }
            }
        }
    };

    mainSpeechUtterance.onend = function() {
        isMainSpeaking = false;
        mainSpeechPaused = false;
        updateButtonStates(false);
        mainCurrentWordIndex = 0;
        highlightCurrentWord(-1);
        isManuallyPaused = false; // Reset manual pause flag
    };

    mainSpeechUtterance.onpause = function() {
        mainSpeechPaused = true;
        updateButtonStates(false); // Show as paused state
    };

    mainSpeechUtterance.onresume = function() {
        mainSpeechPaused = false;
        updateButtonStates(true); // Show as playing state
    };

    // Add onstart handler for resumeFromDefinedWord function too
    mainSpeechUtterance.onstart = function() {
        isMainSpeaking = true;
        updateButtonStates(true);
        
        // Clear ALL existing focus outlines when speech starts
        // Focus will now follow the speaking word automatically
        clearAllKeyboardFocus();
    };

    mainSpeechUtterance.onerror = function(event) {
        // Ignore 'interrupted' and 'canceled' errors as they're expected when switching/resuming
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
            console.error('Main SpeechSynthesis error:', event);
            isMainSpeaking = false;
            stopReading();
        }
    };

    // Highlight the starting word
    highlightCurrentWord(definedWordIndex);

    // Set button states for resuming speech
    updateButtonStates(true);

    // Start speaking from the defined word
    // Small delay to ensure previous speech is completely cancelled
    setTimeout(() => {
        speechSynthesis.speak(mainSpeechUtterance);
    }, 50);
}

// Show error message
function showError(message) {
    outputDiv.innerHTML = `<div style="color: #d32f2f; margin-top: -110px; font-size: 24pt; line-height: 1.1;">${message}</div>`;
}

// Handle word selection on click
function handleWordSelection(event) {
    let selectedText = '';
    let contextElement = null;

    // First, check if text is already selected
    const selection = window.getSelection();
    const selectionText = selection.toString().trim();

    if (selectionText && selectionText.split(' ').length === 1) {
        // Use the selected text
        selectedText = selectionText;
        const range = selection.getRangeAt(0);
        contextElement = range.commonAncestorContainer;
        if (contextElement.nodeType === Node.TEXT_NODE) {
            contextElement = contextElement.parentElement;
        }
    } else {
        // If no text selected, get the word that was clicked
        let target = event.target;
        
        // Check if clicked element is a word span
        if (target.classList && target.classList.contains('word')) {
            selectedText = target.textContent.trim();
            contextElement = target;
            
            // Store the clicked word element for resuming reading later
            definedWordElement = target;
            
            // Find the index of this word in the main word spans array
            if (mainWordSpans && mainWordSpans.length > 0) {
                definedWordIndex = mainWordSpans.indexOf(target);
                // Also store this as the word that opened the modal for focus restoration
                focusedWordIndex = definedWordIndex;
            } else {
                definedWordIndex = -1;
            }
        } else {
            // If clicked on text node, try to extract the word
            if (target.nodeType === Node.TEXT_NODE) {
                target = target.parentElement;
            }
            
            // If we can't identify a specific word span, don't show modal
            // This prevents accidental triggers on empty spaces or unwrapped text
            return;
        }
    }

    // Only proceed if we have a single word
    if (selectedText && selectedText.split(' ').length === 1) {
        // Find the closest meaningful container for context
        while (contextElement && 
               contextElement !== outputDiv && 
               !['P', 'DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(contextElement.tagName)) {
            contextElement = contextElement.parentElement;
        }
        
        // Get context from the meaningful container, fallback to full text
        let context = contextElement ? 
            (contextElement.textContent || contextElement.innerText) : 
            (outputDiv.textContent || outputDiv.innerText);

        // Limit context to a reasonable length
        context = context.substring(0, 500);

        // Pause main reading when user clicks a word (automatic pause, not manual)
        if (isMainSpeaking) {
            autoPauseForDefinition();
        } else {
            // If reading wasn't active, don't try to resume later
            definedWordElement = null;
            definedWordIndex = -1;
            isManuallyPaused = false;
        }

        // Show loading state
        showDefinitionModal(selectedText, "Loading definition...");

        // Get definition from Google AI
        getDefinition(selectedText, context)
            .then(definition => {
                showDefinitionModal(selectedText, definition);
            })
            .catch(error => {
                console.error('Error getting definition:', error);
                showDefinitionModal(selectedText, "Could not load definition. Please try again.");
            });
    }
}

// Show definition modal
function showDefinitionModal(word, content) {
    definitionWord.textContent = word;

    // Format the content with word spans for highlighting and keyboard access
    definitionContent.innerHTML = content.split('\n').map(paragraph => {
        if (paragraph.trim() === '') return '<div class="word-line"><br></div>';
        return `<div class="word-line">${paragraph.split(' ').map(word =>
            `<span class="word definition-word" tabindex="-1" role="button" aria-label="${word}">${word}</span>`
        ).join(' ')}</div>`;
    }).join('');

    // Store the word spans for highlighting
    modalWordSpans = Array.from(document.querySelectorAll('.definition-word'));
    modalWords = modalWordSpans.map(span => span.textContent);
    modalCurrentWordIndex = 0;
    
    // Reset modal focus state
    modalFocusedWordIndex = -1;

    // Reset modal button states
    updateModalButtonStates(false);

    definitionModal.style.display = 'block';
}

// Close definition modal
function closeDefinitionModal() {
    stopDefinitionReading();
    definitionModal.style.display = 'none';
    
    // Restore focus to the word that opened the modal (as requested)
    if (definedWordIndex >= 0 && definedWordIndex < mainWordSpans.length) {
        setWordFocus(definedWordIndex);
    }
    
    // Resume reading using the smart resume logic
    if (mainSpeechPaused) {
        resumeReading();
    }
}

// Get definition from Google AI
async function getDefinition(word, context) {
    try {
        const response = await fetch('/get-definition', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "word to define": word,
                "context sentence": context
            })
        });

        if (!response.ok) {
            throw new Error('Failed to get definition');
        }

        const data = await response.json();
        return data.definition;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

// Handle modal play button click - starts or resumes modal playback
function handleModalPlayClick() {

    
    const definitionText = definitionContent.textContent;
    if (!definitionText) {

        return;
    }
    
    // If paused, resume
    if (modalSpeechUtterance && modalSpeechPaused) {

        resumeDefinitionReading();
    } else if (isModalSpeaking) {
        // If already playing, restart from beginning

        stopDefinitionReading();
        setTimeout(() => readDefinitionAloud(), 100); // Small delay to ensure clean restart
    } else {
        // Start new playback

        readDefinitionAloud();
    }
}

// Handle modal pause button click - pauses modal playback
function handleModalPauseClick() {

    
    if (isModalSpeaking && !modalSpeechPaused) {
        pauseDefinitionReading();
    }
}

// Read the definition aloud with highlighting
async function readDefinitionAloud() {
    const definitionText = definitionContent.textContent;
    if (!definitionText) return;

    // Stop any ongoing speech
    stopAllSpeech();
    modalCurrentWordIndex = 0;
    isModalSpeaking = true;

    // Create utterance
    modalSpeechUtterance = new SpeechSynthesisUtterance(definitionText);

    // Get and set English voice
    const englishVoice = await getEnglishVoice();
    if (englishVoice) {
        modalSpeechUtterance.voice = englishVoice;
        modalSpeechUtterance.lang = englishVoice.lang;
    } else {
        modalSpeechUtterance.lang = 'en-US';
    }

    // Set rate to current selection
    modalSpeechUtterance.rate = speechRate;

    // Event handlers
    modalSpeechUtterance.onboundary = function(event) {
        if (event.name === 'word') {
            const charIndex = event.charIndex;
            let currentCharCount = 0;

            // Find which word we're at based on character index
            for (let i = 0; i < modalWords.length; i++) {
                currentCharCount += modalWords[i].length + (i === modalWords.length - 1 ? 0 : 1); // +1 for space except last word
                if (currentCharCount > charIndex) {
                    modalCurrentWordIndex = i;
                    highlightModalCurrentWord(i);
                    break;
                }
            }
        }
    };

    modalSpeechUtterance.onstart = function() {
        
        isModalSpeaking = true;
        updateModalButtonStates(true);
        
        // Clear ALL existing focus outlines when modal speech starts (same as main content)
        // Focus will now follow the speaking word automatically
        clearAllModalKeyboardFocus();
    };

    modalSpeechUtterance.onend = function() {

        isModalSpeaking = false;
        modalSpeechPaused = false;
        updateModalButtonStates(false);
        modalCurrentWordIndex = 0;
        highlightModalCurrentWord(-1);
    };

    modalSpeechUtterance.onpause = function() {
        modalSpeechPaused = true;
        updateModalButtonStates(false); // Show as paused state
    };

    modalSpeechUtterance.onresume = function() {
        modalSpeechPaused = false;
        updateModalButtonStates(true); // Show as playing state
    };

    modalSpeechUtterance.onerror = function(event) {
        // Ignore 'interrupted' errors as they're expected when switching
        if (event.error !== 'interrupted') {
            console.error('Modal SpeechSynthesis error:', event);
        }
        isModalSpeaking = false;
        stopDefinitionReading();
    };

    // Set button states for starting modal speech
    updateModalButtonStates(true);

    // Start speaking
    speechSynthesis.speak(modalSpeechUtterance);
}

// Pause the definition reading
function pauseDefinitionReading() {
    if (modalSpeechUtterance && !modalSpeechPaused) {
        speechSynthesis.pause();
    }
}

// Resume paused definition reading
function resumeDefinitionReading() {
    if (modalSpeechUtterance && modalSpeechPaused) {
        speechSynthesis.resume();
    }
}

// Stop definition reading completely
function stopDefinitionReading() {

    if (isModalSpeaking) {
        speechSynthesis.cancel();
        isModalSpeaking = false;
    }
    modalSpeechPaused = false;
    updateModalButtonStates(false);
    highlightModalCurrentWord(-1);
}

// Restart modal reading from a specific word index with new speed
async function restartModalFromWord(wordIndex) {
    if (wordIndex < 0 || !modalWords || !modalWordSpans) {
        return;
    }

    // Set the current word index
    modalCurrentWordIndex = wordIndex;
    isModalSpeaking = true;
    modalSpeechPaused = false;

    // Create text starting from the specified word
    const remainingWords = modalWords.slice(wordIndex);
    const textToSpeak = remainingWords.join(' ');

    // Create new utterance for the remaining text
    modalSpeechUtterance = new SpeechSynthesisUtterance(textToSpeak);

    // Get and set English voice
    const englishVoice = await getEnglishVoice();
    if (englishVoice) {
        modalSpeechUtterance.voice = englishVoice;
        modalSpeechUtterance.lang = englishVoice.lang;
    } else {
        modalSpeechUtterance.lang = 'en-US';
    }

    // Set rate to current selection
    modalSpeechUtterance.rate = speechRate;

    // Event handlers
    modalSpeechUtterance.onboundary = function(event) {
        if (event.name === 'word') {
            const charIndex = event.charIndex;
            let currentCharCount = 0;

            // Find which word we're at based on character index (relative to remaining words)
            for (let i = 0; i < remainingWords.length; i++) {
                currentCharCount += remainingWords[i].length + (i === remainingWords.length - 1 ? 0 : 1);
                if (currentCharCount > charIndex) {
                    modalCurrentWordIndex = wordIndex + i;
                    highlightModalCurrentWord(modalCurrentWordIndex);
                    break;
                }
            }
        }
    };

    modalSpeechUtterance.onstart = function() {
        isModalSpeaking = true;
        updateModalButtonStates(true);
        clearAllModalKeyboardFocus();
    };

    modalSpeechUtterance.onend = function() {
        isModalSpeaking = false;
        modalSpeechPaused = false;
        updateModalButtonStates(false);
        modalCurrentWordIndex = 0;
        highlightModalCurrentWord(-1);
    };

    modalSpeechUtterance.onpause = function() {
        modalSpeechPaused = true;
        updateModalButtonStates(false);
    };

    modalSpeechUtterance.onresume = function() {
        modalSpeechPaused = false;
        updateModalButtonStates(true);
    };

    modalSpeechUtterance.onerror = function(event) {
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
            console.error('Modal SpeechSynthesis error:', event);
            isModalSpeaking = false;
            stopDefinitionReading();
        }
    };

    // Highlight the starting word
    highlightModalCurrentWord(wordIndex);

    // Set button states for resuming modal speech
    updateModalButtonStates(true);

    // Start speaking from the specified word
    speechSynthesis.speak(modalSpeechUtterance);
}

// Handle global keyboard events
function handleGlobalKeydown(event) {
    // Don't interfere if user is typing in an input field
    const activeElement = document.activeElement;
    if (activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.isContentEditable
    )) {
        return; // Let the default behavior happen
    }

    // Handle spacebar for play/pause
    if (event.code === 'Space') {
        // Prevent spacebar from scrolling the page
        event.preventDefault();

        // Context-aware spacebar behavior
        if (definitionModal.style.display === 'block') {
            // Modal is open - control modal speech
            handleModalSpacebar();
        } else if (currentText) {
            // Main content is loaded - control main speech
            handleMainSpacebar();
        }
        // If no content is loaded, spacebar does nothing
        return;
    }

    // Handle Escape key to close modal
    if (event.code === 'Escape') {
        const modalIsOpen = definitionModal.style.display === 'block';
        if (modalIsOpen) {
            event.preventDefault();
            closeDefinitionModal();
        }
        return;
    }

    // Handle word navigation (only when text is loaded and not in modal)
    const modalIsOpen = definitionModal.style.display === 'block';
    if (currentText && !modalIsOpen) {
        switch (event.code) {
            case 'Tab':
                // Tab into text area - focus first word of first paragraph
                // Only handle if currently focused on text-display div, not if already on a word
                if (activeElement && activeElement.id === 'text-display') {
                    event.preventDefault();
                    focusFirstWordOfFirstParagraph();
                }
                break;
                
            case 'ArrowLeft':
                event.preventDefault();
                navigateToPreviousWord();
                break;
                
            case 'ArrowRight':
                event.preventDefault();
                navigateToNextWord();
                break;
                
            case 'ArrowUp':
                event.preventDefault();
                navigateToPreviousParagraph();
                break;
                
            case 'ArrowDown':
                event.preventDefault();
                navigateToNextParagraph();
                break;
                
            case 'Enter':
                event.preventDefault();
                handleEnterForDefinition();
                break;
        }
    }
}

// Handle spacebar for main content speech
function handleMainSpacebar() {
    if (!currentText) {
        return;
    }
    
    if (mainSpeechUtterance && mainSpeechPaused) {
        // Currently paused - resume from focused word if available, otherwise normal resume
        if (focusedWordIndex >= 0) {
            resumeFromFocusedWord();
        } else {
            resumeReading();
        }
    } else if (isMainSpeaking) {
        // Currently playing - pause
        pauseReading();
    } else {
        // Not playing - start from focused word if available, otherwise from beginning
        if (focusedWordIndex >= 0) {
            startReadingFromFocusedWord();
        } else {
            readText();
        }
    }
}

// Handle spacebar for modal speech
function handleModalSpacebar() {
    const definitionText = definitionContent.textContent;
    if (!definitionText) {
        return;
    }
    
    if (modalSpeechUtterance && modalSpeechPaused) {
        // Currently paused - resume
        resumeDefinitionReading();
    } else if (isModalSpeaking) {
        // Currently playing - pause
        pauseDefinitionReading();
    } else {
        // Not playing - start
        readDefinitionAloud();
    }
}

// Initialize word navigation system
function initializeWordNavigation() {
    // Reset navigation state
    focusedWordIndex = -1;
    currentParagraphIndex = -1;
    paragraphBoundaries = [];
    
    // Update word spans array
    mainWordSpans = Array.from(document.querySelectorAll('.highlight-word'));
    mainWords = mainWordSpans.map(span => span.textContent);
    
    // Detect paragraph boundaries using HTML structure
    detectParagraphBoundaries();
}

// Detect paragraph boundaries based on HTML structure (p, div, h1-h6)
function detectParagraphBoundaries() {
    const paragraphElements = outputDiv.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6');
    
    paragraphElements.forEach((element) => {
        const wordsInElement = element.querySelectorAll('.highlight-word');
        if (wordsInElement.length > 0) {
            // Find the actual indices of these words in the global mainWordSpans array
            const startIndex = mainWordSpans.indexOf(wordsInElement[0]);
            const endIndex = mainWordSpans.indexOf(wordsInElement[wordsInElement.length - 1]);
            
            // Only add if we found valid indices
            if (startIndex >= 0 && endIndex >= 0) {
                paragraphBoundaries.push({
                    element: element,
                    startIndex: startIndex,
                    endIndex: endIndex
                });
            }
        }
    });
}

// Focus management with roving tabindex (called by user navigation)
function setWordFocus(wordIndex) {
    // Remove focus from previously focused word
    if (focusedWordIndex >= 0 && focusedWordIndex < mainWordSpans.length) {
        mainWordSpans[focusedWordIndex].setAttribute('tabindex', '-1');
        mainWordSpans[focusedWordIndex].classList.remove('keyboard-focused');
    }
    
    // Set focus to new word
    if (wordIndex >= 0 && wordIndex < mainWordSpans.length) {
        focusedWordIndex = wordIndex;
        const wordElement = mainWordSpans[wordIndex];
        
        wordElement.setAttribute('tabindex', '0');
        wordElement.classList.add('keyboard-focused');
        wordElement.focus();
        
        // Update current paragraph index
        updateCurrentParagraphIndex(wordIndex);
        
        // Remove speaking highlight when user navigates (as requested)
        removeAllSpeakingHighlights();
    }
}

// Focus management called by speech system (doesn't remove speech highlights)
function setWordFocusFromSpeech(wordIndex) {
    // Remove focus from previously focused word
    if (focusedWordIndex >= 0 && focusedWordIndex < mainWordSpans.length) {
        mainWordSpans[focusedWordIndex].setAttribute('tabindex', '-1');
        mainWordSpans[focusedWordIndex].classList.remove('keyboard-focused');
    }
    
    // Set focus to new word
    if (wordIndex >= 0 && wordIndex < mainWordSpans.length) {
        focusedWordIndex = wordIndex;
        const wordElement = mainWordSpans[wordIndex];
        
        wordElement.setAttribute('tabindex', '0');
        wordElement.classList.add('keyboard-focused');
        // Don't call wordElement.focus() - this prevents screen reader interruption
        
        // Update current paragraph index
        updateCurrentParagraphIndex(wordIndex);
        
        // Don't remove speaking highlights - let them coexist with focus
    }
}

// Remove speaking highlights when user navigates
function removeAllSpeakingHighlights() {
    mainWordSpans.forEach(span => {
        span.classList.remove('current-word');
        span.classList.remove('highlight');
    });
}

// Clear all keyboard focus outlines (used when speech starts)
function clearAllKeyboardFocus() {
    mainWordSpans.forEach(span => {
        span.classList.remove('keyboard-focused');
        span.setAttribute('tabindex', '-1');
    });
    focusedWordIndex = -1;
}

// Clear all modal keyboard focus outlines (used when modal speech starts)
function clearAllModalKeyboardFocus() {
    modalWordSpans.forEach(span => {
        span.classList.remove('modal-keyboard-focused');
        span.setAttribute('tabindex', '-1');
    });
    modalFocusedWordIndex = -1;
}

// Update current paragraph index based on word index
function updateCurrentParagraphIndex(wordIndex) {
    for (let i = 0; i < paragraphBoundaries.length; i++) {
        const boundary = paragraphBoundaries[i];
        if (wordIndex >= boundary.startIndex && wordIndex <= boundary.endIndex) {
            currentParagraphIndex = i;
            break;
        }
    }
}

// Navigation functions
function focusFirstWordOfFirstParagraph() {
    if (paragraphBoundaries.length > 0 && mainWordSpans.length > 0) {
        const firstParagraph = paragraphBoundaries[0];
        setWordFocus(firstParagraph.startIndex);
    }
}

function navigateToNextWord() {
    if (focusedWordIndex < 0) {
        focusFirstWordOfFirstParagraph();
    } else if (focusedWordIndex < mainWordSpans.length - 1) {
        setWordFocus(focusedWordIndex + 1);
    }
    // Do nothing if at last word (as requested)
}

function navigateToPreviousWord() {
    if (focusedWordIndex <= 0) {
        // Do nothing if at first word or no word focused (as requested)
        return;
    } else {
        setWordFocus(focusedWordIndex - 1);
    }
}

function navigateToNextParagraph() {
    if (currentParagraphIndex < 0) {
        focusFirstWordOfFirstParagraph();
    } else if (currentParagraphIndex < paragraphBoundaries.length - 1) {
        const nextParagraph = paragraphBoundaries[currentParagraphIndex + 1];
        setWordFocus(nextParagraph.startIndex);
    }
    // Do nothing if at last paragraph (as requested)
}

function navigateToPreviousParagraph() {
    if (currentParagraphIndex <= 0) {
        // Do nothing if at first paragraph or no paragraph focused (as requested)
        return;
    } else {
        const prevParagraph = paragraphBoundaries[currentParagraphIndex - 1];
        setWordFocus(prevParagraph.startIndex);
    }
}

// Start reading from the currently focused word
function startReadingFromFocusedWord() {
    if (focusedWordIndex >= 0) {
        // Use the existing resumeFromDefinedWord function but with focused word
        definedWordIndex = focusedWordIndex;
        resumeFromDefinedWord();
    } else {
        readText();
    }
}

// Resume reading from the currently focused word
function resumeFromFocusedWord() {
    if (focusedWordIndex >= 0) {
        // Use the existing resumeFromDefinedWord function but with focused word
        definedWordIndex = focusedWordIndex;
        resumeFromDefinedWord();
    } else {
        resumeReading();
    }
}

// Modal focus management called by speech system (doesn't remove speech highlights)
function setModalWordFocusFromSpeech(wordIndex) {
    // Remove focus from previously focused word
    if (modalFocusedWordIndex >= 0 && modalFocusedWordIndex < modalWordSpans.length) {
        modalWordSpans[modalFocusedWordIndex].setAttribute('tabindex', '-1');
        modalWordSpans[modalFocusedWordIndex].classList.remove('modal-keyboard-focused');
    }
    
    // Set focus to new word
    if (wordIndex >= 0 && wordIndex < modalWordSpans.length) {
        modalFocusedWordIndex = wordIndex;
        const wordElement = modalWordSpans[wordIndex];
        
        wordElement.setAttribute('tabindex', '0');
        wordElement.classList.add('modal-keyboard-focused');
        // Don't call wordElement.focus() - this prevents screen reader interruption
        
        // Don't remove speaking highlights - let them coexist with focus
    }
}

// ARIA live region announcement functions
function announceStatus(message) {
    const statusElement = document.getElementById('upload-status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

function announceError(message) {
    const errorElement = document.getElementById('upload-errors');
    if (errorElement) {
        errorElement.textContent = message;
    }
}

// Handle Enter key for getting definitions intelligently
function handleEnterForDefinition() {
    let targetWord = null;
    let targetIndex = -1;
    
    // Priority 1: If a word currently has keyboard focus, use that
    if (focusedWordIndex >= 0 && focusedWordIndex < mainWordSpans.length) {
        targetWord = mainWordSpans[focusedWordIndex];
        targetIndex = focusedWordIndex;
    }
    // Priority 2: If speech is currently playing, use the current speaking word
    else if (isMainSpeaking && mainCurrentWordIndex >= 0 && mainCurrentWordIndex < mainWordSpans.length) {
        targetWord = mainWordSpans[mainCurrentWordIndex];
        targetIndex = mainCurrentWordIndex;
    }
    // Priority 3: If speech is paused and we have a last current word, use that
    else if (mainSpeechPaused && mainCurrentWordIndex >= 0 && mainCurrentWordIndex < mainWordSpans.length) {
        targetWord = mainWordSpans[mainCurrentWordIndex];
        targetIndex = mainCurrentWordIndex;
    }
    // Priority 4: If we have a defined word from previous interaction, use that
    else if (definedWordIndex >= 0 && definedWordIndex < mainWordSpans.length) {
        targetWord = mainWordSpans[definedWordIndex];
        targetIndex = definedWordIndex;
    }
    // Priority 5: If none of the above, use the first word as fallback
    else if (mainWordSpans.length > 0) {
        targetWord = mainWordSpans[0];
        targetIndex = 0;
    }
    
    // If we found a word to define
    if (targetWord) {
        // Pause audio if playing
        if (isMainSpeaking) {
            pauseReading();
        }
        
        // Set focus to this word for proper modal return behavior
        focusedWordIndex = targetIndex;
        definedWordIndex = targetIndex;
        
        // Get the definition
        handleWordSelection({target: targetWord});
        
        // Announce to screen readers what we're doing
        announceStatus(`Getting definition for "${targetWord.textContent}"`);
    }
}