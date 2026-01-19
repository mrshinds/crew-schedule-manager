import { useState } from 'react'
import { generateICS } from './utils/icsGenerator'

import Calendar from './components/Calendar'
import ImageUploader from './components/ImageUploader'
import FlightTracker from './components/FlightTracker'
import './App.css'

function App() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 0, 1)); // Defaulting to Jan 2026 as per screenshot for dev
  const [scheduleData, setScheduleData] = useState({
    "2026-01-01": { type: 'FLIGHT', flightNumber: 'KE085', route: 'ICN-JFK', time: '19:30-19:30' },
    "2026-01-04": { type: 'ATDO' },
    "2026-01-08": { type: 'FLIGHT', flightNumber: 'KE082', route: 'JFK-ICN', time: '12:00-' }
  });
  const [selectedFlight, setSelectedFlight] = useState(null);

  const handleDateSelect = (dateKey) => {
    const event = scheduleData[dateKey];
    if (event && event.type === 'FLIGHT') {
      setSelectedFlight(event);
    } else {
      setSelectedFlight(null);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>Crew Schedule Manager</h1>
        <div className="month-nav">
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}>&lt;</button>
          <span>{currentDate.getFullYear()}.{String(currentDate.getMonth() + 1).padStart(2, '0')}</span>
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}>&gt;</button>
        </div>
        <div className="controls">
          <ImageUploader
            onScheduleParsed={(events) => setScheduleData(prev => ({ ...prev, ...events }))}
          />
          <button onClick={() => generateICS(scheduleData)}>Download ICS</button>
        </div>
      </header>
      <main className="main-content">
        <div className="left-panel">
          <Calendar
            currentDate={currentDate}
            scheduleData={scheduleData}
            onDateClick={handleDateSelect}
          />
        </div>
        <div className="right-panel">
          <FlightTracker selectedFlight={selectedFlight} />
        </div>
      </main>
    </div>
  )
}

export default App
