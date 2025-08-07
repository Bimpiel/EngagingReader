# === Imports ===
import os                         # For environment variables and file handling
import glob                       # For file pattern matching (e.g., *.jpg)
import base64                     # To encode image data into base64
import json                       # To work with JSON data structures
import logging                    # For logging runtime events and debugging
import io                         # For in-memory binary operations
from flask import Flask, render_template, request, jsonify  # Flask web framework
from google import genai         # Google's Gemini (GenAI) client
from google.genai import types   # Needed to construct content parts and config
from dotenv import load_dotenv   # Load environment variables from .env file
from PIL import Image, ImageFilter  # Pillow for image processing
import pillow_heif               # HEIC/HEIF image format support

# Load environment variables from .env file
load_dotenv()

# Register HEIC file format opener with Pillow
pillow_heif.register_heif_opener()

# === Logging Setup ===
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)  # Allows logging with module context

# === Flask App Setup ===
app = Flask(__name__)
UPLOAD_FOLDER = "uploads"  # Folder to temporarily store uploaded files
os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Ensure the folder exists
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER  # Flask config for file uploads

# === Google Gemini Client Initialization ===
def initialize_genai_client():
    # Load service account credentials from environment variable
    service_account_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not service_account_json:
        raise ValueError("GOOGLE_SERVICE_ACCOUNT_JSON environment variable not set")

    try:
        # Write credentials to a temp file for authentication
        with open("temp_service_account.json", "w") as f:
            f.write(service_account_json)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "temp_service_account.json"
    except Exception as e:
        logger.error(f"Error handling service account: {e}")
        raise

    # Return a Gemini client authenticated with Vertex AI
    return genai.Client(
        vertexai=True,
        project=os.getenv("GOOGLE_PROJECT", "engaging-reader"),
        location=os.getenv("GOOGLE_LOCATION", "us-central1"),
    )

# Create the client once and reuse it globally
client = initialize_genai_client()

# === Helper Function: Get Latest File ===
def get_latest_file(directory="uploads", extensions=("jpg", "jpeg", "png", "heic", "heif", "webp", "pdf")):
    # Find all supported files with matching extensions
    files = [f for ext in extensions for f in glob.glob(os.path.join(directory, f"*.{ext}"))]
    return max(files, key=os.path.getmtime) if files else None  # Return latest one or None

# === Helper Function: Standardize Image ===
def standardize_image(input_image_bytes: bytes, options: dict = None) -> bytes:
    """
    Standardizes an image by resizing, sharpening, and compressing to JPEG.
    Ideal for processing user-uploaded photos to ensure consistency and performance.

    Args:
        input_image_bytes: The raw bytes of the input image (HEIC, JPEG, etc.).
        options: A dictionary for optional settings.
            - max_dimension (int): The maximum width or height. Defaults to 2048.
            - quality (int): The output JPEG quality (1-95). Defaults to 85.

    Returns:
        The raw bytes of the processed JPEG image.
        
    Raises:
        IOError: If the image format is not supported or the data is corrupt.
    """
    if options is None:
        options = {}

    settings = {
        'max_dimension': options.get('max_dimension', 2048),
        'quality': options.get('quality', 85)
    }

    try:
        # Open the image from in-memory bytes
        image_stream = io.BytesIO(input_image_bytes)
        with Image.open(image_stream) as img:
            # If image has transparency (like some PNGs or HEICs), convert it to RGB
            # as JPEG does not support an alpha channel.
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            # Resize the image while maintaining aspect ratio
            img.thumbnail((settings['max_dimension'], settings['max_dimension']))

            # Sharpen the image to enhance text clarity
            img = img.filter(ImageFilter.SHARPEN)

            # Save the processed image to an in-memory buffer
            output_buffer = io.BytesIO()
            img.save(
                output_buffer,
                format="JPEG",
                quality=settings['quality'],
                optimize=True  # Makes an extra pass to find best compression
            )
            return output_buffer.getvalue()

    except Exception as e:
        print(f"Error during image standardization: {e}")
        # Re-raising the exception allows the calling function to handle the error
        raise

# === Core Function: Process Uploaded File and Extract Markdown ===
def process_file(file_path):
    # Create a prompt to guide Gemini on how to extract the data
    text_prompt = types.Part.from_text(text="""Act as an expert document intelligence agent. Your mission is to analyze the document (image or PDF), process its content based on the rules below, and generate a clean, well-structured Markdown document.

Step 1: Language Processing Rule

First, estimate the language distribution in the image and follow the corresponding instruction:

Scenario A: The document contains a significant amount of English text (i.e., English makes up more than 10% of the content).

Action: Extract only the English content. Completely ignore and discard all non-English text.

Scenario B: The document is overwhelmingly non-English (i.e., 90% or more of the text is in a non-English language).

Action: Translate the entire document into English. Any isolated English words should be kept and included in their logical place within the final translated output.

Step 2: Output Rule

Do not include any introductory text, explanations, or preambles in your response. Begin the response directly with the extracted or translated content.

Step 3: Formatting Instructions

After processing the language according to the rule above, format the entire output using these guidelines:

Markdown Output: The entire response must be in Markdown. This includes all text, headings, tables, and lists.

Tables:
-- Recreate all tables as proper Markdown tables.
-- If you are following Scenario A, ensure the tables are built using only the English headers and data columns.

Preserve original emphasis like bold and italics. Preserve paragraphs.

Footnotes:
-- If a table has footnotes, place the full footnote text immediately below its corresponding table.
-- In the table cell, mark the reference number with a tilde, like this: 1,234,567~1~.
-- Begin the footnote text itself with the same marker, like this: ~1~ This is the footnote text.

Completeness: Ensure all extracted (or translated) text, including any URLs, is present in the final output.""")

    # Read and process the file (image or PDF)
    with open(file_path, "rb") as file:
        original_file_bytes = file.read()
    
    # Determine file type based on extension
    _, file_extension = os.path.splitext(file_path.lower())
    
    if file_extension == '.pdf':
        # Handle PDF files directly - no standardization needed
        file_data = original_file_bytes
        mime_type = "application/pdf"
        logger.info(f"Processing PDF file: {len(original_file_bytes)} bytes")
        
    else:
        # Handle image files with standardization
        try:
            # Standardize the image to improve OCR accuracy and reduce processing time
            standardized_image_bytes = standardize_image(original_file_bytes)
            logger.info(f"Image standardized: {len(original_file_bytes)} -> {len(standardized_image_bytes)} bytes")
            
            # Use standardized image data
            file_data = standardized_image_bytes
            mime_type = "image/jpeg"  # Standardized images are always JPEG
            
        except Exception as e:
            # Fall back to original image if standardization fails
            logger.warning(f"Image standardization failed, using original: {e}")
            file_data = original_file_bytes
            
            # Determine MIME type based on file extension for fallback
            if file_extension in ['.png']:
                mime_type = "image/png"
            elif file_extension in ['.jpg', '.jpeg']:
                mime_type = "image/jpeg"
            elif file_extension in ['.heic', '.heif']:
                mime_type = "image/heic"
            elif file_extension in ['.webp']:
                mime_type = "image/webp"
            else:
                # Default to JPEG for unsupported formats
                mime_type = "image/jpeg"

    file_part = types.Part.from_bytes(
        data=file_data,
        mime_type=mime_type,
    )

    # Package the user message as content parts for Gemini
    contents = [
        types.Content(
            role="user",
            parts=[text_prompt, file_part]
        )
    ]

    # Define generation behavior
    config = types.GenerateContentConfig(
        temperature=0,             # Zero creativity for accurate transcription
        top_p=0.95,
        max_output_tokens=8192,   # Large limit to avoid cutoff for long docs
        response_modalities=["TEXT"]
    )

    # Stream response from Gemini and concatenate result
    output_text = ""
    for chunk in client.models.generate_content_stream(
        model="gemini-2.5-flash",
        contents=contents,
        config=config,
    ):
        if chunk.text:  # Only add text if it's not None
            output_text += chunk.text

    return output_text  # Return the markdown-formatted output

# === Flask Route: Homepage ===
@app.route("/")
def index():
    return render_template("index.html")  # Loads index.html from templates folder

# === Flask Route: Image Upload Endpoint ===
@app.route("/upload", methods=["POST"])
def upload_file():
    # Validate presence of file
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    # Save file to uploads folder
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
    file.save(filepath)

    try:
        # Process file (image or PDF) and return the extracted markdown text
        extracted_markdown = process_file(filepath)
        return jsonify({
            "markdown": extracted_markdown,
            "filename": file.filename
        })
    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        # Delete uploaded file to free up space
        if os.path.exists(filepath):
            os.remove(filepath)

# === Flask Route: Context-Based Word Definition ===
@app.route("/get-definition", methods=["POST"])
def get_definition():
    try:
        data = request.get_json()
        logger.info(f"Received data: {data}")  # Log raw incoming request

        # Input validation
        if not data:
            return jsonify({"error": "No data provided"}), 400

        word = data.get("word to define", "").strip()
        context = data.get("context sentence", "").strip()

        if not word:
            return jsonify({"error": "Word to define is required"}), 400
        if not context:
            return jsonify({"error": "Context sentence is required"}), 400

        logger.info(f"Processing definition for word: '{word}' with context: '{context}'")

        # Compose user input into a single message
        user_prompt = f"""WORD TO DEFINE:
{word}
CONTEXT SENTENCE:
{context}"""
        text_prompt = types.Part.from_text(text=user_prompt)

        # Define system behavior for this task
        system_instruction = types.Part.from_text(text="""You are an expert at communicating and teaching vocabulary to adults in a simple and encouraging way.

**Instructions:**
1.  Your primary task is to define the word provided in the "WORD TO DEFINE" field. You must only define this word.
2.  Use the "CONTEXT SENTENCE" field only to understand the word's meaning. Do not define other words from the context.
3.  Write at a 4th-7th grade reading level. Keep sentences short and use everyday language.
4.  If the word is a common grammatical word (like 'with', 'the', 'a', 'is', 'of'), explain the job it does in the sentence instead of giving a dictionary definition.
5.  For all other words, first give a simple, one-sentence definition. Then, explain its meaning using the context. If no context is given, provide a simple, adult-oriented example sentence.

**Examples:**

---
**Input:**
WORD TO DEFINE:
Liable
CONTEXT SENTENCE:
The tenant is liable for any damage caused to the property.

**Output:**
Liable means you are legally responsible for something. In this sentence, it means the person renting the apartment must pay for anything they break.
---
**Input:**
WORD TO DEFINE:
with
CONTEXT SENTENCE:
They arrived with shouts.

**Output:**
'With' is a word that connects things together. In this sentence, its job is to show that the people ('they') and the 'shouts' arrived at the same time.
---
**Input:**
WORD TO DEFINE:
Mandatory
CONTEXT SENTENCE:

**Output:**
Mandatory means something is required and you have to do it; it is not a choice. For example, it is mandatory to have a driver's license to drive a car.
---
**Input:**
WORD TO DEFINE:
Accrue
CONTEXT SENTENCE:
The interest on your savings account will accrue monthly.

**Output:**
Accrue means to build up or be added over time. In this context, it means the extra money from interest is added to your savings account each month, helping it grow.
---
""")

        # Build the request content
        contents = [
            types.Content(
                role="user",
                parts=[text_prompt]
            )
        ]

        # Configure generation settings
        config = types.GenerateContentConfig(
            temperature=0.2,  # Allows more natural explanations
            top_p=0.95,
            max_output_tokens=8192,
            response_modalities=["TEXT"],
            safety_settings=[  # Apply moderation filters
                types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_LOW_AND_ABOVE"),
                types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_LOW_AND_ABOVE"),
                types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_LOW_AND_ABOVE"),
                types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_LOW_AND_ABOVE")
            ],
            system_instruction=[system_instruction],
        )

        # Call Gemini and stream the result
        output_text = ""
        for chunk in client.models.generate_content_stream(
            model="gemini-2.5-flash-lite",
            contents=contents,
            config=config,
        ):
            if chunk.text:  # Only add text if it's not None
                output_text += chunk.text

        logger.info(f"Generated definition: {output_text}")
        return jsonify({"definition": output_text})

    except Exception as e:
        logger.error(f"Error in get_definition: {str(e)}", exc_info=True)
        return jsonify({"error": "An error occurred while processing your request"}), 500

# === Run Flask App Server ===
if __name__ == "__main__":
    app.run(
        debug=os.getenv("FLASK_DEBUG", "false").lower() == "true",  # Enable debug mode from env
        host="0.0.0.0",                                             # Bind to all interfaces
        port=int(os.getenv("PORT", "5000"))                         # Use PORT from env or fallback to 5000
    )
