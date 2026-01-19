import { saveAs } from 'file-saver';

export const generateICS = (events) => {
    let icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CrewScheduleManager//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
`;

    Object.entries(events).forEach(([dateKey, event]) => {
        const uid = `${dateKey}-${Math.random().toString(36).substr(2, 9)}@crewmanager`;
        const dtStamp = new Date().toISOString().replace(/[-:.]/g, '');

        // Parse Date (YYYY-MM-DD)
        const [year, month, day] = dateKey.split('-').map(Number);

        let dtStart = '';
        let dtEnd = '';
        let summary = '';
        let description = '';

        if (event.type === 'ATDO') {
            // All Day Event
            summary = 'ATDO (Rest)';
            // DTSTART;VALUE=DATE:20260104
            const dateStr = dateKey.replace(/-/g, '');
            // Next day for end date (exclusive)
            const nextDay = new Date(year, month - 1, day + 1);
            const nextDayStr = nextDay.toISOString().split('T')[0].replace(/-/g, '');

            icsContent += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtStamp}
DTSTART;VALUE=DATE:${dateStr}
DTEND;VALUE=DATE:${nextDayStr}
SUMMARY:${summary}
DESCRIPTION:Created by Crew Schedule Manager
TRANSP:TRANSPARENT
END:VEVENT
`;
        } else if (event.type === 'FLIGHT') {
            summary = `${event.flightNumber} ${event.route || ''}`;
            description = `Time: ${event.time || 'TBD'}`;

            // Time Parsing is tricky. Assuming "HH:MM-HH:MM" or just "HH:MM"
            // For now, let's make it an All Day Event with Time in title if we can't parse perfectly, 
            // OR default to a 1-hour block if we have a start time.

            // Let's try to parse start time
            if (event.time) {
                const timeParts = event.time.split(/[-~]/).map(t => t.trim());
                const startTime = timeParts[0]; // "19:30"
                // const endTime = timeParts[1]; 

                if (startTime && /^\d{2}:\d{2}$/.test(startTime)) {
                    const [hours, minutes] = startTime.split(':');
                    // Format: YYYYMMDDTHHMMSS
                    dtStart = `${dateKey.replace(/-/g, '')}T${hours}${minutes}00`;

                    // Default duration 3 hours? Or try to use end time?
                    // If End time exists and is smaller than Start Time, implies +1 day.
                    // Complex logic omitted for MVP V1. Defaulting to 1 hour or EndTime if present.

                    let nextDayObj = new Date(year, month - 1, day, parseInt(hours), parseInt(minutes));
                    nextDayObj.setHours(nextDayObj.getHours() + 3); // Arbitrary 3 hour flight if unknown

                    dtEnd = nextDayObj.toISOString().replace(/[-:]/g, '').split('.')[0];
                } else {
                    // Fallback to all day
                    dtStart = dateKey.replace(/-/g, '');
                }
            } else {
                dtStart = dateKey.replace(/-/g, '');
            }

            // If time was parsed as date-time
            const timeTag = dtStart.includes('T') ? `DTSTART:${dtStart}\nDTEND:${dtEnd}` : `DTSTART;VALUE=DATE:${dtStart}`;

            icsContent += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtStamp}
${timeTag}
SUMMARY:${summary}
DESCRIPTION:${description}
END:VEVENT
`;
        }
    });

    icsContent += 'END:VCALENDAR';

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    saveAs(blob, 'crew-schedule.ics');
};
