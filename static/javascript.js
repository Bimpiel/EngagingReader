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

    // Add double-click event listener to output div for word selection
    outputDiv.addEventListener('dblclick', handleWordSelection);

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

        // Enable read button and store the current text
        currentText = cleanHtml;
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

// Prepare text for reading by extracting content and splitting into words
function prepareTextForReading(text) {
    // Create a temporary div to extract text content from HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;

    // Remove any existing spans or highlights
    const existingSpans = tempDiv.querySelectorAll('span.highlight-word');
    existingSpans.forEach(span => {
        span.outerHTML = span.innerHTML;
    });

    // Get the clean text
    const cleanText = tempDiv.textContent || tempDiv.innerText || "";

    return cleanText;
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
        speechSynthesis.cancel();
    }
    isMainSpeaking = false;
    isModalSpeaking = false;
}

// Read the extracted text aloud with highlighting
async function readText() {
    if (!currentText) return;

    // Stop any ongoing speech
    stopAllSpeech();
    mainCurrentWordIndex = 0;
    isMainSpeaking = true;

    // Prepare the text
    const cleanText = prepareTextForReading(currentText);

    // Create word spans for highlighting
    outputDiv.innerHTML = cleanText.split('\n').map(paragraph => {
        if (paragraph.trim() === '') return '<div class="word-line"><br></div>';
        return `<div class="word-line">${paragraph.split(' ').map(word =>
            `<span class="word highlight-word">${word}</span>`
        ).join(' ')}</div>`;
    }).join('');

    // Get all word spans
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
        // Ignore 'interrupted' errors as they're expected when switching
        if (event.error !== 'interrupted') {
            console.error('Main SpeechSynthesis error:', event);
        }
        isMainSpeaking = false;
        stopReading();
    };

    // Enable/disable buttons
    readBtn.disabled = true;
    pauseBtn.disabled = false;
    resumeBtn.disabled = true;
    stopBtn.disabled = false;

    // Start speaking
    speechSynthesis.speak(mainSpeechUtterance);
}

// Pause the main reading
function pauseReading() {
    if (mainSpeechUtterance && !mainSpeechPaused) {
        speechSynthesis.pause();
    }
}

// Resume paused main reading
function resumeReading() {
    if (mainSpeechUtterance && mainSpeechPaused) {
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
}

// Show error message
function showError(message) {
    outputDiv.innerHTML = `<div style="color: #d32f2f; margin-top: -110px; font-size: 24pt; line-height: 1.1;">${message}</div>`;
}

// Handle word selection on double-click
function handleWordSelection(event) {
    // Get the selected text
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText && selectedText.split(' ').length === 1) {
        // Get the surrounding text (context)
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        let context = container.textContent || container.innerText;

        // Limit context to a reasonable length
        context = context.substring(0, 500);

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
                word: word,
                context: context
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