import os
import glob
import base64
import json
import logging
from flask import Flask, render_template, request, jsonify
from google import genai
from google.genai import types

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# Initialize Google Gemini Client
def initialize_genai_client():
    service_account_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not service_account_json:
        raise ValueError("GOOGLE_SERVICE_ACCOUNT_JSON environment variable not set")
    try:
        with open("temp_service_account.json", "w") as f:
            f.write(service_account_json)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "temp_service_account.json"
    except Exception as e:
        logger.error(f"Error handling service account: {e}")
        raise

    return genai.Client(
        vertexai=True,
        project=os.getenv("GOOGLE_PROJECT", "engaging-reader"),
        location=os.getenv("GOOGLE_LOCATION", "us-central1"),
    )

client = initialize_genai_client()

def get_latest_image(directory="uploads", extensions=("jpg", "jpeg", "png")):
    files = [f for ext in extensions for f in glob.glob(os.path.join(directory, f"*.{ext}"))]
    return max(files, key=os.path.getmtime) if files else None

def process_image(image_path):
    text_prompt = types.Part.from_text(text="""Read the text in this image. Ignore any words in French. Preserve the tables as rich tables. If there are footnotes in the table make sure to include them under the table. Write the entire response using markdown format.

Check your work to make sure you included all of the English language text not in the tables.""")

    with open(image_path, "rb") as img_file:
        img_base64 = base64.b64encode(img_file.read()).decode("utf-8")

    image_part = types.Part.from_bytes(
        data=base64.b64decode(img_base64),
        mime_type="image/jpeg",
    )

    contents = [
        types.Content(
            role="user",
            parts=[text_prompt, image_part]
        )
    ]

    config = types.GenerateContentConfig(
        temperature=0,
        top_p=0.95,
        max_output_tokens=8192,
        response_modalities=["TEXT"],
    )

    output_text = ""
    for chunk in client.models.generate_content_stream(
        model="gemini-2.0-flash-001",
        contents=contents,
        config=config,
    ):
        output_text += chunk.text

    return output_text

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    filepath = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
    file.save(filepath)

    try:
        extracted_markdown = process_image(filepath)
        return jsonify({
            "markdown": extracted_markdown,
            "filename": file.filename
        })
    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)

@app.route("/get-definition", methods=["POST"])
def get_definition():
    try:
        data = request.get_json()
        logger.info(f"Received data: {data}")  # Log the incoming data
        
        if not data:
            return jsonify({"error": "No data provided"}), 400

        word = data.get("word", "").strip()
        context = data.get("context", "").strip()

        # Validate input
        if not word:
            return jsonify({"error": "Word is required"}), 400
        if not context:
            return jsonify({"error": "Context is required"}), 400

        logger.info(f"Processing definition for word: '{word}' with context: '{context}'")

        # Create a clear prompt that combines both word and context
        user_prompt = f"""Word to define: {word}
Full sentence context: {context}

Please provide a definition for '{word}' as used in this context, formatted in markdown for easy reading."""
        
        text_prompt = types.Part.from_text(text=user_prompt)

        system_instruction = types.Part.from_text(text="""You are an expert at communicating and teaching vocabulary to adults with low literacy and learning disabilities. 
When given a word and its context, provide an accessible and accurate definition based on how the word is used in the given sentence.

Format your response like this:

**Word**  
Definition and explanation of what it means in this specific context.

Keep these guidelines in mind:
1. Use simple language (grade 4-7 reading level)
2. Explain how the word is used in this specific sentence
3. Format your response in markdown
4. Make the definition practical and relatable""")

        contents = [
            types.Content(
                role="user",
                parts=[text_prompt]
            )
        ]

        config = types.GenerateContentConfig(
            temperature=0.7,  # Slightly creative but mostly factual
            top_p=0.95,
            max_output_tokens=8192,
            response_modalities=["TEXT"],
            safety_settings=[
                types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_LOW_AND_ABOVE"),
                types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_LOW_AND_ABOVE"),
                types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_LOW_AND_ABOVE"),
                types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_LOW_AND_ABOVE")
            ],
            system_instruction=[system_instruction],
        )

        output_text = ""
        for chunk in client.models.generate_content_stream(
            model="gemini-2.0-flash-001",
            contents=contents,
            config=config,
        ):
            output_text += chunk.text

        logger.info(f"Generated definition: {output_text}")
        return jsonify({
            "definition": output_text
        })

    except Exception as e:
        logger.error(f"Error in get_definition: {str(e)}", exc_info=True)
        return jsonify({"error": "An error occurred while processing your request"}), 500

if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG", "false").lower() == "true",
            host="0.0.0.0",
            port=int(os.getenv("PORT", "5000")))