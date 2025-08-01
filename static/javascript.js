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

// Modal TTS variables
let modalSpeechUtterance = null;
let modalReadBtn = document.getElementById("modalReadBtn");
let modalPauseBtn = document.getElementById("modalPauseBtn");
let modalResumeBtn = document.getElementById("modalResumeBtn");
let modalStopBtn = document.getElementById("modalStopBtn");
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

// Speech control buttons
const readBtn = document.getElementById("readBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const stopBtn = document.getElementById("stopBtn");

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
    const preferredVoicesOrder = [
        'en-US', 'en_GB', 'en-GB', 'en-AU', 'en-CA', 'en-IN',
        'en-US-male', 'en-US-female', 'en-GB-oxendict'
    ];
    
    // Try to find exact matches first
    for (const lang of preferredVoicesOrder) {
        const voice = voices.find(v => v.lang.includes(lang));
        if (voice) return voice;
    }
    
    // Fallback to any English voice
    return voices.find(voice => 
        voice.lang.startsWith('en-') || voice.lang.startsWith('en_')
    ) || voices[0]; // Fallback to first available voice if no English found
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Preload voices
    loadVoices();
    
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
    modalReadBtn.addEventListener('click', readDefinitionAloud);
    modalPauseBtn.addEventListener('click', pauseDefinitionReading);
    modalResumeBtn.addEventListener('click', resumeDefinitionReading);
    modalStopBtn.addEventListener('click', stopDefinitionReading);

    // Add event listeners for main TTS
    readBtn.addEventListener('click', readText);
    pauseBtn.addEventListener('click', pauseReading);
    resumeBtn.addEventListener('click', resumeReading);
    stopBtn.addEventListener('click', stopReading);

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
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (file.size > maxSize) {
        showError("File size exceeds 5MB limit. Please choose a smaller file.");
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

        // Enable read button and store the current text
        currentText = cleanHtml;
        console.log('📄 currentText set during upload, length:', cleanHtml.length);
        readBtn.disabled = false;

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
async function readText() {
    console.log('🎵 readText called!');
    console.log('📝 currentText:', currentText ? 'HAS CONTENT' : 'EMPTY/NULL');
    console.log('🔘 readBtn disabled?', readBtn.disabled);
    
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

    // 1. Get the plain text for the speech synthesis engine BEFORE modifying the DOM
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = currentText;
    const cleanText = tempDiv.textContent;

    // 2. Get all word spans for highlighting (words are already wrapped)
    mainWordSpans = Array.from(document.querySelectorAll('.highlight-word'));
    mainWords = mainWordSpans.map(span => span.textContent);

    // Create utterance
    mainSpeechUtterance = new SpeechSynthesisUtterance(cleanText);

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
        readBtn.disabled = false;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        stopBtn.disabled = true;
        mainCurrentWordIndex = 0;
        highlightCurrentWord(-1);
    };

    mainSpeechUtterance.onpause = function() {
        mainSpeechPaused = true;
        pauseBtn.disabled = true;
        resumeBtn.disabled = false;
    };

    mainSpeechUtterance.onresume = function() {
        mainSpeechPaused = false;
        pauseBtn.disabled = false;
        resumeBtn.disabled = true;
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

    // Enable/disable buttons
    readBtn.disabled = true;
    pauseBtn.disabled = false;
    resumeBtn.disabled = true;
    stopBtn.disabled = false;

    // Start speaking
    console.log('🗣️ About to call speechSynthesis.speak()');
    console.log('📊 cleanText length:', cleanText.length);
    console.log('🔢 Word spans found:', mainWordSpans.length);
    speechSynthesis.speak(mainSpeechUtterance);
    console.log('✅ speechSynthesis.speak() called!');
}

// Pause the main reading
function pauseReading() {
    if (mainSpeechUtterance && !mainSpeechPaused) {
        speechSynthesis.pause();
    }
}

// Resume paused main reading
function resumeReading() {
    // If we have a defined word to resume from, use smart resume
    if (definedWordIndex >= 0 && mainWords && mainWords.length > 0) {
        console.log('📍 Using smart resume from defined word:', mainWords[definedWordIndex]);
        resumeFromDefinedWord();
    } else if (mainSpeechUtterance && mainSpeechPaused) {
        console.log('▶️ Using regular resume');
        speechSynthesis.resume();
    }
}

// Stop main reading completely
function stopReading() {
    if (isMainSpeaking) {
        speechSynthesis.cancel();
        isMainSpeaking = false;
    }
    readBtn.disabled = false;
    pauseBtn.disabled = true;
    resumeBtn.disabled = true;
    stopBtn.disabled = true;
    highlightCurrentWord(-1);
    
    // Reset defined word tracking
    definedWordElement = null;
    definedWordIndex = -1;
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
        isMainSpeaking = false;
        readBtn.disabled = false;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        stopBtn.disabled = true;
        mainCurrentWordIndex = 0;
        highlightCurrentWord(-1);
    };

    mainSpeechUtterance.onpause = function() {
        mainSpeechPaused = true;
        pauseBtn.disabled = true;
        resumeBtn.disabled = false;
    };

    mainSpeechUtterance.onresume = function() {
        mainSpeechPaused = false;
        pauseBtn.disabled = false;
        resumeBtn.disabled = true;
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

    // Enable/disable buttons
    readBtn.disabled = true;
    pauseBtn.disabled = false;
    resumeBtn.disabled = true;
    stopBtn.disabled = false;

    // Start speaking from the defined word
    console.log(`🗣️ Resuming reading from word "${mainWords[definedWordIndex]}" at index ${definedWordIndex}`);
    
    // Small delay to ensure previous speech is completely cancelled
    setTimeout(() => {
        speechSynthesis.speak(mainSpeechUtterance);
        console.log('✅ New utterance started');
    }, 100);
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

        // Pause main reading when user clicks a word
        if (isMainSpeaking) {
            pauseReading();
        } else {
            // If reading wasn't active, don't try to resume later
            definedWordElement = null;
            definedWordIndex = -1;
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

    // Reset TTS buttons
    modalReadBtn.disabled = false;
    modalPauseBtn.disabled = true;
    modalResumeBtn.disabled = true;
    modalStopBtn.disabled = true;

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
    
    // Resume reading from the defined word if main reading was active
    if (mainSpeechPaused && definedWordIndex >= 0 && mainWords && mainWords.length > 0) {
        console.log('✅ Conditions met - resuming from word:', mainWords[definedWordIndex]);
        resumeFromDefinedWord();
    } else {
        console.log('❌ Resume conditions not met');
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

    modalSpeechUtterance.onend = function() {
        isModalSpeaking = false;
        modalReadBtn.disabled = false;
        modalPauseBtn.disabled = true;
        modalResumeBtn.disabled = true;
        modalStopBtn.disabled = true;
        modalCurrentWordIndex = 0;
        highlightModalCurrentWord(-1);
    };

    modalSpeechUtterance.onpause = function() {
        modalSpeechPaused = true;
        modalPauseBtn.disabled = true;
        modalResumeBtn.disabled = false;
    };

    modalSpeechUtterance.onresume = function() {
        modalSpeechPaused = false;
        modalPauseBtn.disabled = false;
        modalResumeBtn.disabled = true;
    };

    modalSpeechUtterance.onerror = function(event) {
        // Ignore 'interrupted' errors as they're expected when switching
        if (event.error !== 'interrupted') {
            console.error('Modal SpeechSynthesis error:', event);
        }
        isModalSpeaking = false;
        stopDefinitionReading();
    };

    // Enable/disable buttons
    modalReadBtn.disabled = true;
    modalPauseBtn.disabled = false;
    modalResumeBtn.disabled = true;
    modalStopBtn.disabled = false;

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
    modalReadBtn.disabled = false;
    modalPauseBtn.disabled = true;
    modalResumeBtn.disabled = true;
    modalStopBtn.disabled = true;
    highlightModalCurrentWord(-1);
}