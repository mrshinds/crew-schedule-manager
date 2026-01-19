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
                    // Updated to gemini-1.5-flash (Standard) to fix 404/Version issues
                    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

                    const prompt = `
                    Analyze this flight crew schedule image. Extract all events including Flights, Layovers (ATDO, DO, AL, OFF, LO, STANDBY).
                    Identify the Year and Month from the image if possible (e.g., SKD_2026.01). If not, default to 2026-01.
                    
                    Return ONLY a valid JSON object.
                    Format:
                    {
                        "YYYY-MM-DD": {
                            "type": "FLIGHT" | "ATDO" | "STANDBY" | "OFF" | "LAYOVER",
                            "flightNumber": "KE...",
                            "route": "XXX-YYY",
                            "time": "HH:MM-HH:MM",
                            "note": "Any extra info"
                        }
                    }
                    Use standard airport codes. Correct partial scans (e.g. 'CN-JFK' -> 'ICN-JFK').
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
                // [Zero-Base Rewrite] Robust Local OCR Mode
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // 1. Smart Preprocessing (Canvas Filters)
                    // Tesseract works best on: High Contrast, Black Text, White Background.
                    const scale = 2.0;
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;

                    // Apply filters BEFORE drawing to get clean Grayscale
                    ctx.filter = 'grayscale(100%) contrast(150%)';
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    // 2. Smart Invert (Check Content Brightness)
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    let totalBrightness = 0;
                    const d = imgData.data;
                    // Sample every 40th pixel to speed up
                    for (let i = 0; i < d.length; i += 40) {
                        // RGB average
                        totalBrightness += (d[i] + d[i + 1] + d[i + 2]) / 3;
                    }
                    const avgBrightness = totalBrightness / (d.length / 40);

                    // If average brightness is low (< 110), it implies Dark Mode (White Text on Dark).
                    // Tesseract HATES White text. We must INVERT.
                    if (avgBrightness < 110) {
                        console.log("Dark background detected (" + avgBrightness.toFixed(0) + "). Inverting colors.");
                        ctx.globalCompositeOperation = 'difference';
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.globalCompositeOperation = 'source-over'; // Reset
                    }

                    const dataUrl = canvas.toDataURL('image/jpeg');

                    // 3. Tesseract Processing
                    Tesseract.recognize(
                        dataUrl,
                        'eng',
                        {
                            logger: m => {
                                if (m.status === 'recognizing text') setProgress(parseInt(m.progress * 100));
                            },
                            // PSM 3 = Auto (Robust). PSM 6 = Block. 
                            // Auto is better if the user uploads a screenshot with UI elements.
                            tessedit_pageseg_mode: 3,
                            // No whitelist: Let Tesseract see everything to understand layout.
                        }
                    ).then(({ data: { text } }) => {
                        console.log("Raw OCR Text:", text);
                        localStorage.setItem('last_ocr_text', text);

                        // 4. Robust Fuzzy Parsing
                        const parsedEvents = parseScheduleTextRobust(text);

                        if (Object.keys(parsedEvents).length === 0) {
                            alert("⚠️ 일정을 찾지 못했습니다.\n\nTesseract가 텍스트를 읽지 못했습니다. 'Debug'를 눌러 읽힌 텍스트가 있는지 확인하세요.");
                        } else {
                            alert(`✅ ${Object.keys(parsedEvents).length}개의 일정을 찾았습니다!`);
                        }

                        if (onScheduleParsed) onScheduleParsed(parsedEvents);
                        setLoading(false);
                        setProgress(0);
                        if (onProcessingEnd) onProcessingEnd();
                    }).catch(err => {
                        console.error(err);
                        alert("OCR Error: " + err.message);
                        setLoading(false);
                        if (onProcessingEnd) onProcessingEnd();
                    });
                };
                img.src = event.target.result;
            }
        };
    };

    // [New] Stream-Based Fuzzy Parser (Handles broken grids better)
    const parseScheduleTextRobust = (text) => {
        console.log("Starting Stream Parsing...", text);
        const events = {};

        // 1. Normalize Text
        // Replace common OCR errors
        let cleanText = text
            .replace(/\|/g, ' ') // Pipes to spaces
            .replace(/\r?\n/g, ' ') // Newlines to spaces (treat as one long stream)
            .replace(/€/g, 'E')
            .replace(/CN-/g, 'ICN-') // Fix specific ICN broken prefix
            .replace(/-CN/g, '-ICN')
            .replace(/SYC/g, 'SYD')
            .replace(/NRT/g, 'NRT')
            .replace(/NGO/g, 'NGO');

        // 2. Tokenize
        const tokens = cleanText.split(/\s+/);

        let currentDay = null;

        // REGEX
        const dayRegex = /^(\d{1,2})([^\d]|$)/; // Matches "10" in "10.4" or "10"
        const flightRegex = /^K[E€]?\s*(\d{3,4})$/i; // Matches KE123, K E123, KE 123
        const routeRegex = /^([A-Z]{3})-?([A-Z]{3})$/; // Matches ICN-JFK, ICNJFK
        const statusRegex = /^(ATDO|DO|AL|OFF|LO|STBY|STANDBY)$/i;

        tokens.forEach((token, index) => {
            const cleanToken = token.trim().toUpperCase();
            if (cleanToken.length < 1) return;

            // CHECK: Date
            const dMatch = cleanToken.match(dayRegex);
            if (dMatch) {
                const num = parseInt(dMatch[1]);
                // Heuristic: If number is 1-31, it MIGHT be a date.
                // But it could be a time "10:00" or flight "KE101".
                // If it looks like "10.4" or just "10", we take it as date if previous wasn't a flight num.
                if (num >= 1 && num <= 31) {
                    // Check if it's not part of a time (contains :)
                    if (!cleanToken.includes(':')) {
                        currentDay = num;
                    }
                }
            }

            if (!currentDay) return; // Need a date context first

            const dateKey = `2026-01-${currentDay.toString().padStart(2, '0')}`;

            // CHECK: Flight (KE...)
            // Sometimes flight is "112" (missing KE). 
            // If we have a previous 'KE', we might attach it. For now, strict KE checking.
            const fMatch = cleanToken.match(flightRegex);
            if (fMatch) {
                if (!events[dateKey]) events[dateKey] = { type: 'FLIGHT' };
                events[dateKey].flightNumber = `KE${fMatch[1]}`;
                events[dateKey].type = 'FLIGHT';
            }
            // Heuristic A: If token is just 3-4 digits and we assume it's a flight because we found a route nearby?
            // Skip for safety unless explicit.

            // CHECK: Route (XXX-YYY)
            const rMatch = cleanToken.match(routeRegex);
            if (rMatch) {
                if (!events[dateKey]) events[dateKey] = { type: 'FLIGHT' };
                // Fix partial 'CN'
                let dep = rMatch[1] === 'CN' ? 'ICN' : rMatch[1];
                let arr = rMatch[2] === 'CN' ? 'ICN' : rMatch[2];
                events[dateKey].route = `${dep}-${arr}`;
            }

            // CHECK: Status
            if (statusRegex.test(cleanToken)) {
                if (!events[dateKey] || events[dateKey].type !== 'FLIGHT') {
                    events[dateKey] = { type: 'ATDO', note: cleanToken };
                }
            }
        });

        console.log("Stream Parsed Result:", events);
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
                    * Enter your key to use <b>Gemini 1.5 Flash</b> for high speed analysis.<br />
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
