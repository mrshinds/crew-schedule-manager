import React, { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import './ImageUploader.css';

const ImageUploader = ({ onScheduleParsed, onProcessingStart, onProcessingEnd }) => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const fileInputRef = useRef(null);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        if (onProcessingStart) onProcessingStart();

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // Preprocessing: Scale Up & Grayscale
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Scale 2x for better small text recognition
                const scale = 2;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);



                const dataUrl = canvas.toDataURL('image/jpeg');

                // Tesseract.js processing on processed image
                Tesseract.recognize(
                    dataUrl,
                    'eng',
                    {
                        logger: m => {
                            if (m.status === 'recognizing text') {
                                setProgress(parseInt(m.progress * 100));
                            }
                        },
                        // PSM 6: Assume a single uniform block of text. Good for grids/tables.
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
        };
        reader.readAsDataURL(file);
    };

    // Advanced Parsing Logic (Heuristic for Grid)
    const parseScheduleText = (text) => {
        console.log("Parsing text...", text);
        // Normalize newlines
        const lines = text.split(/\r?\n/);
        const events = {};

        // Regex
        const flightRegex = /(KE\d{3,4})/i;
        const routeRegex = /([A-Z]{3}-[A-Z]{3})/;
        const timeRegex = /(\d{2}:\d{2})/;
        const atdoRegex = /(ATDO|DO|AL|OFF)/i;
        // Day regex: 1-31 (standalone or start of line)
        const dayRegex = /\b([1-9]|[12]\d|3[01])\b/;

        // Strategy: Iterate lines. Use a "currentDay" state.
        // If we see a day number, update state.
        // If we see flight info, assign to currentDay.
        // Safety: If day is too far away or undefined, maybe skip or use next available.

        let currentDay = null;
        let lastDayFoundLineIndex = -1;

        lines.forEach((line, index) => {
            const cleanLine = line.trim();
            if (!cleanLine) return;
            if (cleanLine.length < 2) return; // Skip noise

            // 1. Try to find Day Number
            // Strict: Must be at start or isolated?
            // Let's try finding ANY number 1-31
            const dayMatch = cleanLine.match(dayRegex);
            if (dayMatch) {
                // Heuristic: If we found a flight on the SAME line, the date applies.
                // If we found a number on a line by itself, it's likely a date header.
                const num = parseInt(dayMatch[0]);

                // Avoid capturing minutes/hours as days (e.g. 19:30 -> 19 and 30)
                // If the line contains a colon, ignore numbers unless at start
                const hasTime = cleanLine.includes(':');
                const isStart = cleanLine.indexOf(dayMatch[0]) === 0;

                if (!hasTime || isStart) {
                    currentDay = num;
                    lastDayFoundLineIndex = index;
                }
            }

            if (currentDay) {
                const dateKey = `2026-01-${currentDay.toString().padStart(2, '0')}`;

                let foundEvent = false;

                // Detect Flight
                const flightMatch = cleanLine.match(flightRegex);
                if (flightMatch) {
                    if (!events[dateKey]) events[dateKey] = { type: 'FLIGHT' };
                    // If we already have a flight for this day and we are > 5 lines away from day detection,
                    // maybe we are drifting? For now, overwrite/update is safer than skipping.
                    events[dateKey].type = 'FLIGHT';
                    events[dateKey].flightNumber = flightMatch[0];
                    foundEvent = true;
                }

                // Detect Route
                const routeMatch = cleanLine.match(routeRegex);
                if (routeMatch) {
                    if (!events[dateKey]) events[dateKey] = { type: 'FLIGHT' }; // Assume flight if route seen
                    events[dateKey].route = routeMatch[0];
                    foundEvent = true;
                }

                // Detect Time
                const timeMatch = cleanLine.match(timeRegex);
                if (timeMatch) {
                    // Only add time if we think it's a flight day
                    if (events[dateKey]) {
                        const exist = events[dateKey].time || '';
                        if (!exist.includes(timeMatch[0])) {
                            events[dateKey].time = exist ? `${exist}-${timeMatch[0]}` : timeMatch[0];
                        }
                    }
                }

                // Detect ATDO
                if (atdoRegex.test(cleanLine)) {
                    // Check if it's part of a word? "BATDO" -> No.
                    // atdoRegex matches substrings.
                    // Check boundaries?
                    if (/\b(ATDO|DO|AL|OFF)\b/i.test(cleanLine)) {
                        if (!events[dateKey] || events[dateKey].type !== 'FLIGHT') {
                            events[dateKey] = { type: 'ATDO' };
                        }
                    }
                }

                // If we found an event, and the line didn't have the date,
                // we assume "next lines" still belong to this date UNTIL we see a new date.
                // But in a calendar grid, data text is usually Below the date.
                // This logic holds.
            }
        });

        console.log("Parsed Events (Advanced):", events);
        return events;
    };

    return (
        <div className="uploader-container">
            <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={loading}
                ref={fileInputRef}
                style={{ display: 'none' }}
            />
            <button
                className="upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
            >
                {loading ? `Processing ${progress}%` : 'Upload Schedule Image'}
            </button>
            {loading && <div className="loading-bar" style={{ width: `${progress}%` }}></div>}

            {/* Debugging Section */}
            <details style={{ marginTop: '10px', width: '100%', fontSize: '0.8rem', textAlign: 'left' }}>
                <summary>Debug: View Raw OCR Text</summary>
                <pre style={{ background: '#eee', padding: '10px', borderRadius: '4px', overflow: 'auto', maxHeight: '200px' }}>
                    {localStorage.getItem('last_ocr_text') || "No OCR text yet. Upload an image."}
                </pre>
            </details>
        </div>
    );
};

export default ImageUploader;
