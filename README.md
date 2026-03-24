# Albanian Audio Transcriber

A Flask application that uses Google's Gemini Flash model to accurately transcribe Albanian (Shqip) language audio files.

## Features
- **Upload or Record**: Upload existing audio files (`mp3`, `wav`, `flac`, etc.) or record audio directly from your microphone via the browser.
- **Audio Visualizer**: Native HTML5 Canvas-based visualizer reacting to live microphone audio during recording.
- **Subtitles**: Optional `.srt` subtitle generation with automatic timeline extraction.
- **React Frontend**: The UI is fully driven by a single React component (`TranscriberApp`) utilizing React hooks, made easy via Babel browser compilation.

## Requirements
```bash
pip install flask google-genai
```

*Note: You must set the `GOOGLE_API_KEY` inside `app.py` before running the app.*

## Getting Started
1. Run the Flask server:
   ```bash
   python app.py
   ```
2. Navigate to `http://127.0.0.1:5000` in your web browser.
