import os
import glob
import base64
import json
from flask import Flask, render_template, request, jsonify
from google.oauth2 import service_account
from google import genai
from google.genai import types

app = Flask(__name__)

# Configure Google Cloud credentials from Render environment variables
creds_json = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
creds_dict = json.loads(creds_json)
credentials = service_account.Credentials.from_service_account_info(creds_dict)

# Initialize Gemini client (using older v0.1.0 API)
client = genai.Client(
    vertexai=True,
    project=os.environ.get("GCP_PROJECT_ID", "engaging-reader"),  # Fallback to your default
    location=os.environ.get("GCP_LOCATION", "us-central1"),      # Fallback to your default
    credentials=credentials
)

# File upload setup
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

def get_latest_image(directory="uploads", extensions=("jpg", "jpeg", "png")):
    """Fetch the latest uploaded image file."""
    files = [f for ext in extensions for f in glob.glob(os.path.join(directory, f"*.{ext}"))]
    return max(files, key=os.path.getmtime) if files else None

def process_image(image_path):
    """Process image using Gemini AI with your original prompt."""
    text_prompt = types.Part.from_text(text="""
    Read the text in this image. Ignore any words in French. Preserve the tables as rich tables. 
    If there are footnotes in the table make sure to include them under the table. 
    Write the entire response using markdown format.

    Check your work to make sure you included all of the English language text not in the tables.
    """)

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
        model="gemini-1.0-pro-vision",  # Updated model name for compatibility
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

    extracted_markdown = process_image(filepath)
    
    return jsonify({
        "markdown": extracted_markdown,
        "filename": file.filename
    })

@app.route("/get-definition", methods=["POST"])
def get_definition():
    data = request.get_json()
    word = data.get("word", "")
    context = data.get("context", "")

    if not word or not context:
        return jsonify({"error": "Word and context are required"}), 400

    try:
        text_prompt = types.Part.from_text(text=f"""input: {word}. {context}
output:""")
        
        system_instruction = types.Part.from_text(text="""You are an expert at communicating and teaching vocabulary...""")  # Keep your original prompt

        contents = [
            types.Content(
                role="user",
                parts=[text_prompt]
            )
        ]

        config = types.GenerateContentConfig(
            temperature=1,
            top_p=0.95,
            max_output_tokens=8192,
            response_modalities=["TEXT"],
            safety_settings=[
                types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF")
            ],
            system_instruction=[system_instruction],
        )

        output_text = ""
        for chunk in client.models.generate_content_stream(
            model="gemini-1.0-pro",  # Updated model name for compatibility
            contents=contents,
            config=config,
        ):
            output_text += chunk.text

        return jsonify({
            "definition": output_text
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)