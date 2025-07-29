# Engaging Reader

An interactive reading application that uses Google's Gemini AI (via Vertex AI) to extract text from uploaded images and provides an enhanced reading experience with text-to-speech functionality and contextual word definitions.

## Features

- **Image-to-Text Extraction**: Upload images of documents, books, or any text content and extract readable text using Google's Gemini 2.5 Flash via Vertex AI
- **Text-to-Speech with Word Highlighting**: Listen to extracted text with synchronized word-by-word highlighting during speech
- **Interactive Definitions**: Double-click on any word to get contextual, accessible definitions designed for adults with low literacy
- **Format Preservation**: Maintains original document formatting (headings, paragraphs, tables) while adding speech functionality
- **Clean, Accessible UI**: Designed with readability and accessibility in mind
- **Drag & Drop Support**: Easy file upload with visual feedback

## Prerequisites

- Python 3.7 or higher
- Google Cloud Platform account with Vertex AI API enabled
- Google Cloud service account with appropriate permissions

## Setup Instructions

### 1. Clone and Navigate to Project

```bash
git clone <your-repository-url>
cd EngagingReader
```

### 2. Create Virtual Environment (Recommended)

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Google Cloud Setup

#### a. Enable Required APIs
1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Vertex AI API
   - Cloud AI Platform API

#### b. Create Service Account
1. Go to **IAM & Admin > Service Accounts**
2. Click **Create Service Account**
3. Give it a name (e.g., "engaging-reader-service")
4. Grant the following roles:
   - Vertex AI User
   - AI Platform Developer (if needed)
5. Click **Done**

#### c. Generate Service Account Key
1. Click on your newly created service account
2. Go to the **Keys** tab
3. Click **Add Key > Create New Key**
4. Choose **JSON** format
5. Download the JSON file

### 5. Environment Variables

Create a `.env` file in your project root:

```bash
# Required - Replace with your actual service account JSON content
GOOGLE_SERVICE_ACCOUNT_JSON={"type": "service_account", "project_id": "your-project", "private_key_id": "abc123...", "private_key": "-----BEGIN PRIVATE KEY-----\nyour-actual-key\n-----END PRIVATE KEY-----\n", "client_email": "your-service@your-project.iam.gserviceaccount.com", "client_id": "123456789", "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token", "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs", "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/your-service%40your-project.iam.gserviceaccount.com", "universe_domain": "googleapis.com"}

# Optional (with defaults)
GOOGLE_PROJECT=your-google-cloud-project-id
GOOGLE_LOCATION=us-central1
FLASK_DEBUG=false
PORT=5000
```

**Important**: The `GOOGLE_SERVICE_ACCOUNT_JSON` should contain the entire contents of your downloaded JSON file as a single line string.

#### Alternative: Set Environment Variables Directly

**macOS/Linux:**
```bash
export GOOGLE_SERVICE_ACCOUNT_JSON='{"type": "service_account", "project_id": "your-project", ...}'
export GOOGLE_PROJECT=your-google-cloud-project-id
```

**Windows:**
```cmd
set GOOGLE_SERVICE_ACCOUNT_JSON={"type": "service_account", "project_id": "your-project", ...}
set GOOGLE_PROJECT=your-google-cloud-project-id
```

### 6. Run the Application

```bash
python app.py
```

The application will be available at `http://localhost:5000`

## Usage

1. **Upload an Image**: Click the upload area or drag and drop an image containing text
2. **Wait for Processing**: The AI will extract and format the text from your image while preserving document structure
3. **Read Interactively**: 
   - Use the speech controls to listen to the text with synchronized word highlighting
   - Double-click on any word to get contextual, accessible definitions
   - Pause, resume, or stop reading at any time
4. **Navigate**: Click the "Engaging Reader" banner to start over with a new image

## Key Features

### Text-to-Speech with Highlighting
- **Word-by-word highlighting** during speech synthesis
- **Preserves original formatting** (headings, paragraphs, tables remain intact)
- **Multiple speech controls**: play, pause, resume, stop
- **English voice selection** with automatic fallbacks

### Contextual Definitions
- **Double-click any word** to get definitions
- **Context-aware explanations** based on surrounding text
- **Accessible language** designed for grade 4-7 reading levels
- **Educational focus** for adults with low literacy and learning disabilities

### Document Intelligence
- **Multi-language support**: Extracts English content or translates non-English documents
- **Format preservation**: Maintains tables, headings, lists, and formatting
- **Smart text extraction** using Gemini 2.5 Flash model

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | ✅ | - | Google Cloud service account credentials as JSON string |
| `GOOGLE_PROJECT` | ❌ | "engaging-reader" | Google Cloud project ID |
| `GOOGLE_LOCATION` | ❌ | "us-central1" | Google Cloud region for Vertex AI |
| `FLASK_DEBUG` | ❌ | "false" | Enable Flask debug mode |
| `PORT` | ❌ | "5000" | Port to run the application on |

## Supported File Types

- JPEG (.jpg, .jpeg)
- PNG (.png)
- Maximum file size: 5MB

## Technical Architecture

- **Backend**: Flask application with Google Cloud Vertex AI integration
- **Frontend**: Vanilla JavaScript with Web Speech API
- **AI Models**: 
  - Gemini 2.5 Flash for image processing and text extraction
  - Gemini 2.0 Flash for contextual word definitions
- **Deployment**: Ready for Render.com with included `render.yaml`

## Troubleshooting

### Common Issues

1. **"GOOGLE_SERVICE_ACCOUNT_JSON environment variable not set"**
   - Ensure your `.env` file is in the project root
   - Verify the JSON content is properly formatted as a single line string
   - Check that `python-dotenv` is installed

2. **"Permission denied" errors with Google Cloud**
   - Verify your service account has the "Vertex AI User" role
   - Ensure the Vertex AI API is enabled in your Google Cloud project
   - Check that your project ID matches the one in the service account

3. **Text-to-speech not working**
   - Check browser permissions for speech synthesis
   - Try a different browser (Chrome/Edge recommended)
   - Ensure system volume is enabled

4. **Application won't start**
   - Check that port 5000 isn't already in use
   - Set a different port using the `PORT` environment variable
   - Verify all dependencies are installed: `pip install -r requirements.txt`

### Logs

Enable debug mode for more detailed logging:
```bash
export FLASK_DEBUG=true
python app.py
```

## Deployment

This project includes a `render.yaml` file for deployment to Render.com. For other platforms:

- **Build**: `pip install -r requirements.txt`
- **Start**: `gunicorn app:app`
- **Environment**: Set `GOOGLE_SERVICE_ACCOUNT_JSON` in your deployment platform's environment variables

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly (especially text-to-speech and definition features)
5. Submit a pull request

## License

[Add your license information here]

## Support

For issues and questions, please [create an issue](link-to-your-issues-page) in the repository. 