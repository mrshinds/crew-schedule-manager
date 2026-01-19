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

        // Tesseract.js processing
        Tesseract.recognize(
            file,
            'eng', // We might need 'kor' later? Mostly flight codes are ENG.
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        setProgress(parseInt(m.progress * 100));
                    }
                }
            }
        ).then(({ data: { text } }) => {
            console.log("Raw OCR Text:", text); // Debugging
            localStorage.setItem('last_ocr_text', text); // Save for debug UI

            const parsedEvents = parseScheduleText(text);

            if (Object.keys(parsedEvents).length === 0) {
                alert("일정을 찾지 못했습니다. 디버그 메뉴(Debug)에서 인식된 텍스트를 확인해주세요.");
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

    // Basic Parsing Logic
    const parseScheduleText = (text) => {
        console.log("Parsing text...", text);
        const lines = text.split('\n');
        const events = {};

        // Regex Definitions
        const flightRegex = /(KE\d{3,4})/i;
        const routeRegex = /([A-Z]{3}-[A-Z]{3})/;
        const timeRegex = /(\d{2}:\d{2})/;
        const atdoRegex = /(ATDO|DO|AL)/i;

        let currentDay = null;

        lines.forEach(line => {
            const cleanLine = line.trim();
            if (!cleanLine) return;

            // Check for day number at start of line
            const dayMatch = cleanLine.match(/^(\d{1,2})\b/);
            if (dayMatch) {
                const dayNum = parseInt(dayMatch[1]);
                if (dayNum >= 1 && dayNum <= 31) {
                    currentDay = dayNum;
                }
            }

            if (currentDay) {
                // Hardcode year/month for demo context (2026-01)
                const dateKey = `2026-01-${currentDay.toString().padStart(2, '0')}`;

                // Detect Flight
                const flightMatch = cleanLine.match(flightRegex);
                if (flightMatch) {
                    if (!events[dateKey]) events[dateKey] = { type: 'FLIGHT' };
                    events[dateKey].type = 'FLIGHT';
                    events[dateKey].flightNumber = flightMatch[0];
                }

                const routeMatch = cleanLine.match(routeRegex);
                if (routeMatch && events[dateKey] && events[dateKey].type === 'FLIGHT') {
                    events[dateKey].route = routeMatch[0];
                }

                const timeMatch = cleanLine.match(timeRegex);
                if (timeMatch && events[dateKey] && events[dateKey].type === 'FLIGHT') {
                    const existTime = events[dateKey].time || '';
                    if (!existTime.includes(timeMatch[0])) {
                        events[dateKey].time = existTime ? `${existTime}-${timeMatch[0]}` : timeMatch[0];
                    }
                }

                // Detect ATDO (Priority 2)
                if (atdoRegex.test(cleanLine)) {
                    // Overwrite if it was just empty, but flight takes precedence? 
                    // User said ATDO is distinct. If line has ATDO it's likely the main event for that day if not a flight.
                    // But sometimes ATDO might be mentioned with flight? Unlikely for crew.
                    if (!events[dateKey] || events[dateKey].type !== 'FLIGHT') {
                        events[dateKey] = { type: 'ATDO' };
                    }
                }
            }
        });

        console.log("Parsed Events:", events);
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
