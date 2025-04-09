import os
import glob
import base64
from flask import Flask, render_template, request, jsonify
from google import genai
from google.genai import types

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service_account_file.json"

app = Flask(__name__)
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# Google Gemini Client
client = genai.Client(
    vertexai=True,
    project="engaging-reader",
    location="us-central1",
)

def get_latest_image(directory="uploads", extensions=("jpg", "jpeg", "png")):
    """Fetch the latest uploaded image file from the given directory."""
    files = [f for ext in extensions for f in glob.glob(os.path.join(directory, f"*.{ext}"))]
    return max(files, key=os.path.getmtime) if files else None

def process_image(image_path):
    """Process the image using Gemini AI and return extracted text."""
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
        # Prepare the prompt for Gemini
        text_prompt = types.Part.from_text(text=f"""input: {word}. {context}
output:""")
        
        system_instruction = types.Part.from_text(text="""You are an expert at communicating and teaching vocabulary to adults with low literacy and learning disabilities. Users will provide you first with a word and then the sentence that it takes place in and you will need to provide them with an accessible and accurate definition based on the context. For each word you respond in the following format:

**Word**

Definition and what it means in context of the sentence
Provide your response in markdown format. Make sure that your responses are accessible for adults with a reading level between grade 4 and 7.
for example: Agglomeration. The operating budget of $92.7 million finances (i) local services such as library, parks and recreation, Emergency Medical Services, snow clearing, waste management and road maintenance and (ii) its portion of island-wide Agglomeration services such as police, fire and public transit is an  input and  the output would be Definition: Agglomeration means a group or collection of things gathered together. In this sentence, it refers to services that are shared across the whole island, like police, fire services, and public transportation. These services are provided to everyone on the island, not just one specific town or area.""")

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

        # Generate the definition
        output_text = ""
        for chunk in client.models.generate_content_stream(
            model="gemini-2.0-flash-001",
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