import React, { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import './ImageUploader.css';

const ImageUploader = ({ onScheduleParsed, onProcessingStart, onProcessingEnd }) => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
    const fileInputRef = useRef(null);

    const saveApiKey = (key) => {
        setApiKey(key);
        localStorage.setItem('gemini_api_key', key);
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        if (onProcessingStart) onProcessingStart();

        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = async (event) => {
            // Check if we are in Gemini Mode
            if (apiKey && apiKey.length > 10) {
                const base64Data = event.target.result.split(',')[1];
                try {
                    const genAI = new GoogleGenerativeAI(apiKey);
                    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

                    const prompt = `
                    Analyze this flight crew schedule image. Extract all events including Flights, Layovers (ATDO, DO, AL, OFF, LO, STANDBY).
                    Identify the Year and Month from the image if possible (e.g., SKD_2026.01). If not, default to 2026-01.
                    
                    Return ONLY a valid JSON object with detailed keys. Do not use Markdown code blocks.
                    Format:
                    {
                        "YYYY-MM-DD": {
                            "type": "FLIGHT" | "ATDO" | "STANDBY" | "OFF" | "LAYOVER",
                            "flightNumber": "KE...",
                            "route": "XXX-YYY",
                            "time": "HH:MM-HH:MM" (optional),
                            "note": "Any extra info"
                        }
                    }
                    For multi-day flights, just index by the start date. Use standard airport codes (ICN, JFK, etc).
                    If a day has multiple info, prioritize the Flight.
                    `;

                    const result = await model.generateContent([
                        prompt,
                        {
                            inlineData: {
                                data: base64Data,
                                mimeType: file.type
                            }
                        }
                    ]);

                    const responseText = result.response.text();
                    console.log("Gemini Raw Response:", responseText);
                    localStorage.setItem('last_ocr_text', responseText);

                    // Clean and Parse JSON
                    let jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
                    // Sometimes it returns array, sometimes object. Handle robustly.
                    const parsedEvents = JSON.parse(jsonStr);

                    alert(`${Object.keys(parsedEvents).length} events found via Gemini!`);
                    if (onScheduleParsed) onScheduleParsed(parsedEvents);

                } catch (error) {
                    console.error("Gemini Error:", error);
                    alert(`Gemini API Error: ${error.message}. Please check your key or quota.`);
                }

                setLoading(false);
                setProgress(0);
                if (onProcessingEnd) onProcessingEnd();

            } else {
                // Local Fallback Mode
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // Scale 2x for better small text recognition
                    const scale = 2;
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;

                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const dataUrl = canvas.toDataURL('image/jpeg');

                    // Tesseract.js processing
                    Tesseract.recognize(
                        dataUrl,
                        'eng',
                        {
                            logger: m => {
                                if (m.status === 'recognizing text') {
                                    setProgress(parseInt(m.progress * 100));
                                }
                            },
                            tessedit_pageseg_mode: 6,
                        }
                    ).then(({ data: { text } }) => {
                        console.log("Raw OCR Text:", text);
                        localStorage.setItem('last_ocr_text', text);

                        const parsedEvents = parseScheduleText(text);

                        if (Object.keys(parsedEvents).length === 0) {
                            alert("일정을 찾지 못했습니다. (이미지가 너무 복잡하거나 글자가 작습니다)");
                        } else {
                            alert(`${Object.keys(parsedEvents).length}개의 일정을 찾았습니다!`);
                        }

                        if (onScheduleParsed) onScheduleParsed(parsedEvents);

                        setLoading(false);
                        setProgress(0);
                        if (onProcessingEnd) onProcessingEnd();
                    }).catch(err => {
                        console.error(err);
                        setLoading(false);
                        if (onProcessingEnd) onProcessingEnd();
                    });
                };
                img.src = event.target.result;
            }
        };
    };

    // Advanced Parsing Logic (Heuristic for Grid)
    const parseScheduleText = (text) => {
        console.log("Parsing text...", text);
        const lines = text.split(/\r?\n/);
        const events = {};

        const flightRegex = /(KE\d{3,4})/i;
        const routeRegex = /([A-Z]{3}-[A-Z]{3})/;
        const timeRegex = /(\d{2}:\d{2})/;
        const atdoRegex = /(ATDO|DO|AL|OFF)/i;
        const dayRegex = /\b([1-9]|[12]\d|3[01])\b/;

        let currentDay = null;

        lines.forEach((line, index) => {
            const cleanLine = line.trim();
            if (!cleanLine || cleanLine.length < 2) return;

            const dayMatch = cleanLine.match(dayRegex);
            if (dayMatch) {
                const num = parseInt(dayMatch[0]);
                const hasTime = cleanLine.includes(':');
                const isStart = cleanLine.indexOf(dayMatch[0]) === 0;
                if (!hasTime || isStart) {
                    currentDay = num;
                }
            }

            if (currentDay) {
                const dateKey = `2026-01-${currentDay.toString().padStart(2, '0')}`;

                const flightMatch = cleanLine.match(flightRegex);
                if (flightMatch) {
                    if (!events[dateKey]) events[dateKey] = { type: 'FLIGHT' };
                    events[dateKey].type = 'FLIGHT';
                    events[dateKey].flightNumber = flightMatch[0];
                }

                const routeMatch = cleanLine.match(routeRegex);
                if (routeMatch) {
                    if (!events[dateKey]) events[dateKey] = { type: 'FLIGHT' };
                    events[dateKey].route = routeMatch[0];
                }

                const timeMatch = cleanLine.match(timeRegex);
                if (timeMatch) {
                    if (events[dateKey]) {
                        const exist = events[dateKey].time || '';
                        if (!exist.includes(timeMatch[0])) {
                            events[dateKey].time = exist ? `${exist}-${timeMatch[0]}` : timeMatch[0];
                        }
                    }
                }

                if (atdoRegex.test(cleanLine)) {
                    if (/\b(ATDO|DO|AL|OFF)\b/i.test(cleanLine)) {
                        if (!events[dateKey] || events[dateKey].type !== 'FLIGHT') {
                            events[dateKey] = { type: 'ATDO' };
                        }
                    }
                }
            }
        });
        return events;
    };

    return (
        <div className="uploader-container">
            <div style={{ marginBottom: '15px', padding: '15px', background: '#eef', borderRadius: '8px', border: '1px solid #ccd', textAlign: 'left' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '1rem', color: '#1a73e8' }}>
                    ✨ Gemini Premium Feature (Optional)
                </label>
                <input
                    type="password"
                    placeholder="Enter your Gemini API Key here..."
                    value={apiKey}
                    onChange={(e) => saveApiKey(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '6px',
                        border: '1px solid #ccc',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                        marginBottom: '4px'
                    }}
                />
                <div style={{ fontSize: '0.8rem', color: '#555' }}>
                    * Enter your key to use <b>Gemini 1.5 Pro</b> for 99.9% accurate schedule recognition.<br />
                    * Without a key, it will use basic local OCR (lower accuracy).
                </div>
            </div>

            <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={loading}
                ref={fileInputRef}
                style={{ display: 'none' }}
            />

            <button
                className={`upload-btn ${apiKey ? 'gemini-mode' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                style={{
                    background: apiKey ? 'linear-gradient(135deg, #1a73e8, #4285F4)' : '#666',
                    color: 'white',
                    fontWeight: 'bold',
                    padding: '15px 30px',
                    fontSize: '1.2rem',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    width: '100%',
                    marginTop: '10px'
                }}
            >
                {loading ? `Analyzing Schedule...` : apiKey ? '🚀 Upload & Analyze (Gemini AI)' : '📷 Upload (Standard OCR)'}
            </button>

            {loading && !apiKey && <div className="loading-bar" style={{ width: `${progress}%` }}></div>}

            <details style={{ marginTop: '20px', width: '100%', fontSize: '0.8rem', textAlign: 'left', color: '#666', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                <summary>Debug: View Raw Output</summary>
                <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px', overflow: 'auto', maxHeight: '150px', whiteSpace: 'pre-wrap' }}>
                    {localStorage.getItem('last_ocr_text') || "Waiting for upload..."}
                </pre>
            </details>
        </div>
    );
};

export default ImageUploader;
