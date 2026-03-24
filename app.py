import os
import tempfile
from flask import Flask, render_template, request, jsonify
from google import genai
from google.genai import types

app = Flask(__name__)

GOOGLE_API_KEY = ""
client = genai.Client(api_key=GOOGLE_API_KEY)

ALLOWED_EXTENSIONS = {"mp3", "wav", "ogg", "flac", "aac", "aiff", "webm", "m4a"}
MIME_MAP = {
    "mp3": "audio/mp3",
    "wav": "audio/wav",
    "ogg": "audio/ogg",
    "flac": "audio/flac",
    "aac": "audio/aac",
    "aiff": "audio/aiff",
    "webm": "audio/webm",
    "m4a": "audio/mp4",
}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/transcribe", methods=["POST"])
def transcribe():
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided."}), 400

    file = request.files["audio"]

    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else ""

    # For browser recordings that come as .webm, treat them as webm
    if not ext or ext not in ALLOWED_EXTENSIONS:
        # Try to infer from content type
        content_type = file.content_type or ""
        if "webm" in content_type:
            ext = "webm"
        elif "wav" in content_type:
            ext = "wav"
        elif "ogg" in content_type:
            ext = "ogg"
        elif "mp4" in content_type or "m4a" in content_type:
            ext = "m4a"
        else:
            return (
                jsonify(
                    {
                        "error": f"Unsupported file format. Supported: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
                    }
                ),
                400,
            )

    mime_type = MIME_MAP.get(ext, f"audio/{ext}")

    try:
        # Save to a temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        # Upload to Gemini Files API
        uploaded_file = client.files.upload(file=tmp_path)

        # Check if SRT format is requested
        want_srt = request.form.get("srt", "false") == "true"

        # Send transcription request
        if want_srt:
            prompt = (
                "Transcribe the following audio into SRT subtitle format. "
                "The audio is in Albanian (Shqip). "
                "Output ONLY valid SRT content with sequential numbered entries. "
                "Each entry must have: a sequence number, a timestamp line "
                "(HH:MM:SS,mmm --> HH:MM:SS,mmm), and the subtitle text. "
                "Separate entries with a blank line. "
                "Keep each subtitle segment 1-2 sentences long. "
                "Preserve the original Albanian text exactly as spoken. "
                "Do NOT wrap the output in markdown code blocks."
            )
        else:
            prompt = (
                "Transcribe the following audio accurately. "
                "The audio is in Albanian (Shqip). "
                "Provide only the transcription text, nothing else. "
                "If there are multiple speakers, indicate speaker changes. "
                "Preserve the original Albanian text exactly as spoken."
            )

        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=[prompt, uploaded_file],
        )

        # Clean up temp file
        os.unlink(tmp_path)

        result = {"transcription": response.text}
        if want_srt:
            result["format"] = "srt"
        return jsonify(result)

    except Exception as e:
        # Clean up temp file on error
        if "tmp_path" in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
