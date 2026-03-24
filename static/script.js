const { useState, useRef, useEffect } = React;

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatTime(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function TranscriberApp() {
  const [activeTab, setActiveTab] = useState("upload");
  const [selectedFile, setSelectedFile] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [result, setResult] = useState(null);
  const [isSrt, setIsSrt] = useState(false); // Does response contain SRT format
  const [wantSrt, setWantSrt] = useState(false); // Checkbox state
  const [errorMsg, setErrorMsg] = useState(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [recordStatusMsg, setRecordStatusMsg] = useState("Click to start recording");

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationIdRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const resultCardRef = useRef(null);

  // Stop recording cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      clearInterval(timerIntervalRef.current);
      cancelAnimationFrame(animationIdRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelected = (file) => {
    setSelectedFile(file);
    setResult(null);
    setErrorMsg(null);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "audio/ogg;codecs=opus";
          if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "";
        }
      }

      const options = mimeType ? { mimeType } : {};
      const mr = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mr;
      let chunks = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mr.onstop = () => {
        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        const file = new File([blob], `recording.${ext}`, { type: blob.type });
        setSelectedFile(file);
        setRecordStatusMsg("Recording saved — ready to transcribe!");
        stream.getTracks().forEach((track) => track.stop());
      };

      mr.start(100);
      setIsRecording(true);
      setRecordStatusMsg("Recording...");
      setTimerSeconds(0);
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(s => s + 1);
      }, 1000);

      setupVisualizer(stream);
    } catch (err) {
      setErrorMsg("Microphone access denied. Please allow microphone access and try again.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    clearInterval(timerIntervalRef.current);
    cancelAnimationFrame(animationIdRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else {
        setSelectedFile(null);
        startRecording();
    }
  };

  const setupVisualizer = (stream) => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    audioContextRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasCtx = canvas.getContext("2d");
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationIdRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const w = canvas.width;
      const h = canvas.height;
      canvasCtx.clearRect(0, 0, w, h);

      const barWidth = (w / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * h;
        const r = 226;
        const g = 32 + (dataArray[i] / 255) * 30;
        const b = 44;
        canvasCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.5 + (dataArray[i] / 255) * 0.5})`;
        canvasCtx.fillRect(x, h - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
    };
    draw();
  };

  const transcribe = async () => {
    if (!selectedFile) return;
    setIsTranscribing(true);
    setResult(null);
    setErrorMsg(null);
    setIsCopied(false);

    const formData = new FormData();
    formData.append("audio", selectedFile);
    if (wantSrt) formData.append("srt", "true");

    try {
      const response = await fetch("/transcribe", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Transcription failed.");
      
      setResult(data.transcription);
      setIsSrt(data.format === "srt");
      setTimeout(() => {
        if (resultCardRef.current) {
          resultCardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 100);
    } catch (err) {
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleDownloadSrt = () => {
    if (!result) return;
    const blob = new Blob([result], { type: "text/srt;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcription.srt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="container">
      <header className="hero">
        <div className="flag-accent">
          <span className="flag-red"></span>
          <span className="flag-black"></span>
        </div>
        <h1>Albanian Audio Transcriber</h1>
        <p className="subtitle">Upload or record Albanian audio and get instant transcription</p>
      </header>

      <div className="card glass-card">
        <div className="tabs" role="tablist">
          <button
            className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => { setActiveTab('upload'); setResult(null); setErrorMsg(null); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload File
          </button>
          <button
            className={`tab ${activeTab === 'record' ? 'active' : ''}`}
            onClick={() => { setActiveTab('record'); setResult(null); setErrorMsg(null); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            Record Audio
          </button>
        </div>

        {activeTab === 'upload' && (
          <div className="panel active">
            {!selectedFile ? (
              <div 
                className={`dropzone ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => { if (fileInputRef.current) fileInputRef.current.click(); }}
              >
                <div className="dropzone-content">
                  <svg className="dropzone-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="dropzone-text">Drag & drop your audio file here</p>
                  <p className="dropzone-hint">or click to browse</p>
                  <p className="dropzone-formats">MP3, WAV, OGG, FLAC, AAC, M4A</p>
                </div>
                <input type="file" ref={fileInputRef} accept="audio/*" onChange={(e) => e.target.files[0] && handleFileSelected(e.target.files[0])} hidden />
              </div>
            ) : (
              <div className="file-info">
                <div className="file-details">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <span>{selectedFile.name}</span>
                  <span>{formatFileSize(selectedFile.size)}</span>
                </div>
                <button className="btn-remove" onClick={handleRemoveFile} title="Remove file">✕</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'record' && (
          <div className="panel active">
            <div className="recorder">
              <button className={`record-btn ${isRecording ? 'recording' : ''}`} onClick={toggleRecording} title="Start recording">
                <div className="record-btn-inner"></div>
              </button>
              <p className="record-status">{recordStatusMsg}</p>
              {isRecording && <p className="record-timer">{formatTime(timerSeconds)}</p>}
              <div className={`visualizer-container ${(!isRecording && (!selectedFile || selectedFile.name.startsWith('recording'))) ? '' : 'hidden'}`}>
                <canvas ref={canvasRef} width="400" height="60" style={{ display: isRecording ? 'block' : 'none' }}></canvas>
              </div>
            </div>
          </div>
        )}

        <div className="options-bar">
          <label className="checkbox-label" htmlFor="srt-checkbox">
            <input type="checkbox" id="srt-checkbox" checked={wantSrt} onChange={e => setWantSrt(e.target.checked)} />
            <span className="checkbox-custom"></span>
            <span>Output as SRT subtitles</span>
          </label>
        </div>

        <button className="btn-transcribe" onClick={transcribe} disabled={!selectedFile || isTranscribing}>
          {!isTranscribing ? (
            <span className="btn-text">Transcribe Audio</span>
          ) : (
            <div className="btn-loader">
              <div className="spinner"></div>
              <span>Transcribing...</span>
            </div>
          )}
        </button>
      </div>

      {result && (
        <div className="card glass-card result-card" ref={resultCardRef}>
          <div className="result-header">
            <h2>Transcription</h2>
            <div className="result-actions">
              {isSrt && (
                <button className="btn-download" onClick={handleDownloadSrt} title="Download SRT file">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span>Download .srt</span>
                </button>
              )}
              <button className={`btn-copy ${isCopied ? 'copied' : ''}`} onClick={handleCopy} title="Copy to clipboard">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>{isCopied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>
          <div className="result-body">{result}</div>
        </div>
      )}

      {errorMsg && (
        <div className="card glass-card error-card">
          <div className="error-content">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <p>{errorMsg}</p>
          </div>
        </div>
      )}
    </main>
  );
}

const rootNode = document.getElementById('root');
const root = ReactDOM.createRoot(rootNode);
root.render(<TranscriberApp />);
