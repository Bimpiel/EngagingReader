import os
import glob
import base64
import json
from flask import Flask, render_template, request, jsonify
from google.oauth2 import service_account
import google.generativeai as genai
from google.generativeai.types import GenerationConfig, HarmCategory, HarmBlockThreshold

app = Flask(__name__)

# Configure Google Cloud credentials from Render environment variables
creds_json = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
creds_dict = json.loads(creds_json)
credentials = service_account.Credentials.from_service_account_info(creds_dict)

# Initialize Gemini
genai.configure(
    credentials=credentials,
    project=os.environ.get("GCP_PROJECT_ID", "engaging-reader"),
    location=os.environ.get("GCP_LOCATION", "us-central1")
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
    """Process image using Gemini AI."""
    model = genai.GenerativeModel('gemini-pro-vision')
    
    with open(image_path, "rb") as img_file:
        img_data = img_file.read()

    response = model.generate_content(
        [
            """Read the text in this image. Ignore any words in French. Preserve the tables as rich tables. 
            If there are footnotes in the table make sure to include them under the table. 
            Write the entire response using markdown format.

            Check your work to make sure you included all of the English language text not in the tables.""",
            img_data
        ],
        generation_config=GenerationConfig(
            temperature=0,
            top_p=0.95,
            max_output_tokens=8192,
        ),
        safety_settings={
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
        }
    )
    
    return response.text

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
        model = genai.GenerativeModel('gemini-pro')
        
        response = model.generate_content(
            f"""You are an expert at communicating and teaching vocabulary to adults with low literacy and learning disabilities. Users will provide you first with a word and then the sentence that it takes place in and you will need to provide them with an accessible and accurate definition based on the context. For each word you respond in the following format:

**Word**

Definition and what it means in context of the sentence
Provide your response in markdown format. Make sure that your responses are accessible for adults with a reading level between grade 4 and 7.

Input: {word}. {context}
Output:""",
            generation_config=GenerationConfig(
                temperature=1,
                top_p=0.95,
                max_output_tokens=8192,
            ),
            safety_settings={
                HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            }
        )

        return jsonify({
            "definition": response.text
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)