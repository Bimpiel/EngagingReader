# === Imports ===
import os                         # For environment variables and file handling
import glob                       # For file pattern matching (e.g., *.jpg)
import base64                     # To encode image data into base64
import json                       # To work with JSON data structures
import logging                    # For logging runtime events and debugging
from flask import Flask, render_template, request, jsonify  # Flask web framework
from google import genai         # Google's Gemini (GenAI) client
from google.genai import types   # Needed to construct content parts and config

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

# === Helper Function: Get Latest Image ===
def get_latest_image(directory="uploads", extensions=("jpg", "jpeg", "png")):
    # Find all image files with matching extensions
    files = [f for ext in extensions for f in glob.glob(os.path.join(directory, f"*.{ext}"))]
    return max(files, key=os.path.getmtime) if files else None  # Return latest one or None

# === Core Function: Process Uploaded Image and Extract Markdown ===
def process_image(image_path):
    # Create a prompt to guide Gemini on how to extract the data
    text_prompt = types.Part.from_text(text="""Read the text in this image. Ignore any words in French...
    [Extensive formatting and instruction text omitted here for brevity]
    """)

    # Open the image, encode it in base64, and decode it back to binary
    with open(image_path, "rb") as img_file:
        img_base64 = base64.b64encode(img_file.read()).decode("utf-8")

    image_part = types.Part.from_bytes(
        data=base64.b64decode(img_base64),
        mime_type="image/jpeg",  # Change this if your upload supports PNG
    )

    # Package the user message as content parts for Gemini
    contents = [
        types.Content(
            role="user",
            parts=[text_prompt, image_part]
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
        model="gemini-2.0-flash-001",
        contents=contents,
        config=config,
    ):
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
        # Process image and return the extracted markdown text
        extracted_markdown = process_image(filepath)
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

        word = data.get("word", "").strip()
        context = data.get("context", "").strip()

        if not word:
            return jsonify({"error": "Word is required"}), 400
        if not context:
            return jsonify({"error": "Context is required"}), 400

        logger.info(f"Processing definition for word: '{word}' with context: '{context}'")

        # Compose user input into a single message
        user_prompt = f"""{word}. {context}"""
        text_prompt = types.Part.from_text(text=user_prompt)

        # Define system behavior for this task
        system_instruction = types.Part.from_text(text="""You are an expert at communicating and teaching vocabulary...
        [Instruction text guiding tone and example omitted for brevity]
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
            temperature=0.7,  # Allows more natural explanations
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
            model="gemini-2.0-flash-001",
            contents=contents,
            config=config,
        ):
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
