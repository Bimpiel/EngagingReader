// DOM elements
const fileInput = document.getElementById("fileInput");
const outputDiv = document.getElementById("text-display");
const loadingOverlay = document.getElementById("loading-overlay");
const dropArea = document.getElementById("drop-area");

// Main speech synthesis variables
let speechSynthesis = window.speechSynthesis;
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

// Track the word that was clicked for definition
let definedWordElement = null;
let definedWordIndex = -1;

// Track if pause was manual (pause button) vs automatic (definition)
let isManuallyPaused = false;

// Speech control buttons
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");

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
    
    console.log(`🖥️ Platform: ${isWindows ? 'Windows' : isMac ? 'Mac' : 'Other'}, Browser: ${isSafari ? 'Safari' : isChrome ? 'Chrome' : 'Other'}`);
    
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
            console.log(`🎯 Using preferred voice: ${voice.name} (${voice.lang}) for ${isSafari ? 'Safari' : isChrome ? 'Chrome' : 'Browser'}`);
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
            console.log(`🎯 Using voice by language: ${voice.name || 'Unknown'} (${voice.lang})`);
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
        console.log(`🎯 Using fallback English voice: ${englishVoice.name || 'Unknown'} (${englishVoice.lang || 'Unknown'})`);
        return englishVoice;
    }
    
    // Last resort - first available voice
    console.log('⚠️ No English voice found, using first available voice');
    console.log('Available voices:', voices.map(v => `${v.name} (${v.lang})`));
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
            console.log('🎯 Voice preloaded:', preloadedVoice ? preloadedVoice.name : 'None');
        } catch (error) {
            console.error('❌ Error preloading voice:', error);
        }
    }, 100);
    
    // Hide speech controls initially
    document.getElementById('speech-controls').style.display = 'none';
    
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

    // File input change
    fileInput.addEventListener('change', uploadImage);
});

// Upload and process image
async function uploadImage() {
    // Hide speech controls when starting new upload
    document.getElementById('speech-controls').style.display = 'none';
    
    if (!fileInput.files.length) {
        showError("Please select an image file first.");
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
        return;
    }

    // Check file size (50MB limit - generous for high-quality documents)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
        showError("File size exceeds 50MB limit. Please choose a smaller file.");
        return;
    }

    // Show loading state
    loadingOverlay.style.display = 'flex';
    outputDiv.innerHTML = "";

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

        // Enable play button and store the current text
        currentText = cleanHtml;
        console.log('📄 currentText set during upload, length:', cleanHtml.length);
        
        // Set initial button states (not playing)
        updateButtonStates(false);

        // Show speech controls after successful processing
        document.getElementById('speech-controls').style.display = 'flex';

        // Hide upload container and show content
        document.getElementById('upload-container').style.display = 'none';

    } catch (error) {
        showError(error.message);
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
    }
}

// Stop all speech synthesis
function stopAllSpeech() {
    if (speechSynthesis.speaking || speechSynthesis.paused) {
        console.log('🛑 Stopping all speech synthesis');
        speechSynthesis.cancel();
    }
    // Don't immediately reset speaking states as the error handlers might need them
    // Let the individual functions handle their own state management
}

// Read the extracted text aloud with highlighting
function readText() {
    console.log('🎵 readText called!');
    console.log('📝 currentText:', currentText ? 'HAS CONTENT' : 'EMPTY/NULL');
    console.log('🔘 playBtn disabled?', playBtn.disabled);
    
    if (!currentText) {
        console.log('❌ No currentText - returning early');
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
        console.log('🔧 Chrome detected - starting dummy utterance for context');
        const dummyUtterance = new SpeechSynthesisUtterance('');
        dummyUtterance.volume = 0;
        speechSynthesis.speak(dummyUtterance);
    }

    // Create utterance
    mainSpeechUtterance = new SpeechSynthesisUtterance(cleanText);

    // Use preloaded voice (Chrome compatibility fix) or fallback
    if (preloadedVoice) {
        console.log('🎯 Using preloaded voice:', preloadedVoice.name);
        mainSpeechUtterance.voice = preloadedVoice;
        mainSpeechUtterance.lang = preloadedVoice.lang;
    } else {
        console.log('⚠️ No preloaded voice available - using system default');
        mainSpeechUtterance.lang = 'en-US';
        // Try to load voice asynchronously in background for next time
        getEnglishVoice().then(voice => {
            if (voice) preloadedVoice = voice;
        });
    }

    // Set default rate
    mainSpeechUtterance.rate = 1;

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
        console.log('🏁 Speech ended');
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
        console.log('✅ Speech actually started');
        isMainSpeaking = true;
        updateButtonStates(true);
    };

    mainSpeechUtterance.onerror = function(event) {
        console.error('❌ Speech error:', event.error);
        
        // Ignore 'interrupted' and 'canceled' errors as they're expected when switching/resuming
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
            // Chrome fallback: try again with a fresh utterance
            if (isChrome && event.error !== 'not-allowed') {
                console.log('🔧 Attempting Chrome fallback...');
                setTimeout(() => {
                    console.log('🔄 Retrying speech synthesis for Chrome...');
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
        } else {
            console.log('🔇 Speech cancelled/interrupted (expected):', event.error);
        }
    };

    // Set button states for starting speech (will be updated by onstart event)
    updateButtonStates(true);

    // Start speaking
    console.log('🗣️ About to call speechSynthesis.speak()');
    console.log('📊 cleanText length:', cleanText.length);
    console.log('🔢 Word spans found:', mainWordSpans.length);
    console.log('🎯 Voice being used:', mainSpeechUtterance.voice ? mainSpeechUtterance.voice.name : 'System default');
    
    // Chrome-specific: Try immediate start first if we have preloaded voice, then fallback to delayed
    if (isChrome) {
        if (preloadedVoice) {
            console.log('🚀 Chrome with preloaded voice - attempting immediate start');
            speechSynthesis.speak(mainSpeechUtterance);
            console.log('✅ speechSynthesis.speak() called immediately!');
            
            // Still monitor for silent failures
            setTimeout(() => {
                if (isMainSpeaking && !speechSynthesis.speaking) {
                    console.log('⚠️ Immediate start failed - trying delayed restart');
                    speechSynthesis.cancel();
                    setTimeout(() => {
                        speechSynthesis.speak(mainSpeechUtterance);
                    }, 50);
                }
            }, 200);
        } else {
            console.log('⏳ Chrome without preloaded voice - using delayed start');
            setTimeout(() => {
                speechSynthesis.speak(mainSpeechUtterance);
                console.log('✅ speechSynthesis.speak() called (Chrome delayed)!');
                
                // Set a timeout to detect if Chrome is ignoring the speech request
                setTimeout(() => {
                    if (isMainSpeaking && !speechSynthesis.speaking) {
                        console.log('⚠️ Chrome may have silently failed - trying manual restart');
                        speechSynthesis.cancel();
                        speechSynthesis.speak(mainSpeechUtterance);
                    }
                }, 500);
            }, 50);
        }
    } else {
        speechSynthesis.speak(mainSpeechUtterance);
        console.log('✅ speechSynthesis.speak() called!');
    }
}

// Handle play button click - starts or resumes playback
function handlePlayClick() {
    console.log('🎵 Play button clicked!');
    
    if (!currentText) {
        console.log('❌ No currentText available');
        return;
    }
    
    // If paused, resume
    if (mainSpeechUtterance && mainSpeechPaused) {
        console.log('▶️ Resuming paused speech');
        resumeReading();
    } else if (isMainSpeaking) {
        // If already playing, restart from beginning
        console.log('🔄 Restarting speech from beginning');
        stopReading();
        setTimeout(() => readText(), 100); // Small delay to ensure clean restart
    } else {
        // Start new playback
        console.log('🎵 Starting new speech');
        readText();
    }
}

// Handle pause button click - pauses playback
function handlePauseClick() {
    console.log('⏸️ Pause button clicked!');
    
    if (isMainSpeaking && !mainSpeechPaused) {
        pauseReading();
    }
}

// Pause the main reading
function pauseReading() {
    if (mainSpeechUtterance && !mainSpeechPaused) {
        speechSynthesis.pause();
        isManuallyPaused = true; // Mark as manually paused
        console.log('⏸️ Manual pause detected');
    }
}

// Auto-pause for definition (doesn't set manual pause flag)
function autoPauseForDefinition() {
    if (mainSpeechUtterance && !mainSpeechPaused) {
        speechSynthesis.pause();
        console.log('⏸️ Auto-pause for definition');
    }
}

// Resume paused main reading
function resumeReading() {
    if (definedWordIndex >= 0 && mainWords && mainWords.length > 0) {
        // If there's a defined word, always prioritize resuming from that word
        console.log('📍 Using smart resume from defined word (priority):', mainWords[definedWordIndex]);
        resumeFromDefinedWord();
        isManuallyPaused = false; // Reset manual pause flag since we're overriding it
    } else if (isManuallyPaused) {
        // If manually paused (and no defined word), do regular resume
        console.log('▶️ Using regular resume (manual pause)');
        if (mainSpeechUtterance && mainSpeechPaused) {
            speechSynthesis.resume();
            isManuallyPaused = false; // Reset manual pause flag
        }
    } else if (mainSpeechUtterance && mainSpeechPaused) {
        console.log('▶️ Using regular resume (fallback)');
        speechSynthesis.resume();
    }
}

// Stop main reading completely
function stopReading() {
    console.log('🛑 Stopping speech');
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
    console.log('🔄 resumeFromDefinedWord called');
    console.log('📍 definedWordIndex:', definedWordIndex);
    console.log('📝 mainWords:', mainWords ? mainWords.slice(Math.max(0, definedWordIndex-2), definedWordIndex+3) : 'null');
    
    if (definedWordIndex < 0 || !mainWords || !mainWordSpans) {
        console.log('❌ Cannot resume from defined word - invalid index or missing data');
        return;
    }

    // Only cancel speech if it's actually speaking, not if it's just paused
    if (speechSynthesis.speaking && !speechSynthesis.paused) {
        console.log('🛑 Canceling active speech');
        speechSynthesis.cancel();
    } else if (speechSynthesis.paused) {
        console.log('⏸️ Speech is paused, canceling it');
        speechSynthesis.cancel();
    }
    
    // Set the current word index to the defined word
    mainCurrentWordIndex = definedWordIndex;
    isMainSpeaking = true;
    mainSpeechPaused = false;

    // Create text starting from the defined word
    const remainingWords = mainWords.slice(definedWordIndex);
    const textToSpeak = remainingWords.join(' ');
    
    console.log('🗣️ Text to speak (first 50 chars):', textToSpeak.substring(0, 50) + '...');
    console.log('📊 Remaining words count:', remainingWords.length);

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

    // Set default rate
    mainSpeechUtterance.rate = 1;

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
        console.log('🏁 Speech ended (resume function)');
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

    mainSpeechUtterance.onerror = function(event) {
        // Ignore 'interrupted' and 'canceled' errors as they're expected when switching/resuming
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
            console.error('Main SpeechSynthesis error:', event);
            isMainSpeaking = false;
            stopReading();
        } else {
            console.log('🔇 Speech cancelled/interrupted (expected):', event.error);
        }
    };

    // Highlight the starting word
    highlightCurrentWord(definedWordIndex);

    // Set button states for resuming speech
    updateButtonStates(true);

    // Start speaking from the defined word
    console.log(`🗣️ Resuming reading from word "${mainWords[definedWordIndex]}" at index ${definedWordIndex}`);
    
    // Small delay to ensure previous speech is completely cancelled
    setTimeout(() => {
        speechSynthesis.speak(mainSpeechUtterance);
        console.log('✅ New utterance started');
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
                console.log('🎯 Word clicked:', selectedText);
                console.log('📍 Word index found:', definedWordIndex);
                console.log('📊 Total words:', mainWordSpans.length);
            } else {
                console.log('⚠️ mainWordSpans not available, cannot track word index');
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

    // Format the content with word spans for highlighting
    definitionContent.innerHTML = content.split('\n').map(paragraph => {
        if (paragraph.trim() === '') return '<div class="word-line"><br></div>';
        return `<div class="word-line">${paragraph.split(' ').map(word =>
            `<span class="word definition-word">${word}</span>`
        ).join(' ')}</div>`;
    }).join('');

    // Store the word spans for highlighting
    modalWordSpans = Array.from(document.querySelectorAll('.definition-word'));
    modalWords = modalWordSpans.map(span => span.textContent);
    modalCurrentWordIndex = 0;

    // Reset modal button states
    updateModalButtonStates(false);

    definitionModal.style.display = 'block';
}

// Close definition modal
function closeDefinitionModal() {
    stopDefinitionReading();
    definitionModal.style.display = 'none';
    
    // Debug logging
    console.log('🔍 Modal closed - checking resume conditions:');
    console.log('📊 mainSpeechPaused:', mainSpeechPaused);
    console.log('📍 definedWordIndex:', definedWordIndex);
    console.log('🎤 mainSpeechUtterance exists:', !!mainSpeechUtterance);
    console.log('📝 mainWords length:', mainWords ? mainWords.length : 'null');
    
    // Resume reading using the smart resume logic
    if (mainSpeechPaused) {
        console.log('✅ Main speech was paused - using smart resume logic');
        resumeReading();
    } else {
        console.log('❌ Main speech not paused - no resume needed');
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
    console.log('🎵 Modal play button clicked!');
    
    const definitionText = definitionContent.textContent;
    if (!definitionText) {
        console.log('❌ No definition text available');
        return;
    }
    
    // If paused, resume
    if (modalSpeechUtterance && modalSpeechPaused) {
        console.log('▶️ Resuming modal speech');
        resumeDefinitionReading();
    } else if (isModalSpeaking) {
        // If already playing, restart from beginning
        console.log('🔄 Restarting modal speech from beginning');
        stopDefinitionReading();
        setTimeout(() => readDefinitionAloud(), 100); // Small delay to ensure clean restart
    } else {
        // Start new playback
        console.log('🎵 Starting new modal speech');
        readDefinitionAloud();
    }
}

// Handle modal pause button click - pauses modal playback
function handleModalPauseClick() {
    console.log('⏸️ Modal pause button clicked!');
    
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

    // Set default rate
    modalSpeechUtterance.rate = 1;

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
        console.log('✅ Modal speech actually started');
        isModalSpeaking = true;
        updateModalButtonStates(true);
    };

    modalSpeechUtterance.onend = function() {
        console.log('🏁 Modal speech ended');
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
    console.log('🛑 Stopping modal speech');
    if (isModalSpeaking) {
        speechSynthesis.cancel();
        isModalSpeaking = false;
    }
    modalSpeechPaused = false;
    updateModalButtonStates(false);
    highlightModalCurrentWord(-1);
}