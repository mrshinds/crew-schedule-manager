import React from 'react';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isSunday,
    isSaturday
} from 'date-fns';
import './Calendar.css';

const Calendar = ({ currentDate, scheduleData, onDateClick }) => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const daysInMonth = eachDayOfInterval({
        start: startDate,
        end: endDate
    });

    const weekDayHeaders = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    const getDayClass = (day) => {
        if (isSunday(day)) return 'sun';
        if (isSaturday(day)) return 'sat';
        return '';
    };

    const renderEvent = (day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const event = scheduleData[dateKey];

        if (!event) return null;

        if (event.type === 'ATDO') {
            return (
                <div className="event-block atdo">
                    ATDO
                </div>
            );
        }

        if (event.type === 'FLIGHT') {
            return (
                <div className="event-block flight">
                    <div className="flight-route">{event.flightNumber}</div>
                    <div className="flight-route">{event.route}</div>
                    <div className="flight-time">{event.time}</div>
                </div>
            );
        }

        return null;
    };

    return (
        <div className="calendar-container">
            <div className="calendar-header">
                {format(currentDate, 'yyyy.MM')}
            </div>

            <div className="weekdays-grid">
                {weekDayHeaders.map((day, index) => (
                    <div key={day} className={`weekday-cell ${index === 0 ? 'sun' : index === 6 ? 'sat' : ''}`}>
                        {day}
                    </div>
                ))}
            </div>

            <div className="days-grid">
                {daysInMonth.map((day) => {
                    const dateKey = format(day, 'yyyy-MM-dd');
                    return (
                        <div
                            key={day.toString()}
                            className={`day-cell ${!isSameMonth(day, monthStart) ? 'other-month' : ''} ${getDayClass(day)}`}
                            onClick={() => onDateClick && onDateClick(dateKey)}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className="date-label">{format(day, 'd')}</div>
                            {renderEvent(day)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Calendar;
