// Attendance & Geofence Configuration for Al-Madina Islamic Academy
// Brahmanbaria Campus

const MADRASA_LOCATION = {
  LATITUDE: parseFloat(process.env.MADRASA_LAT || process.env.NEXT_PUBLIC_MADRASA_LAT || "24.3840"),
  LONGITUDE: parseFloat(process.env.MADRASA_LNG || process.env.NEXT_PUBLIC_MADRASA_LNG || "91.4169"),
  RADIUS_METERS: parseFloat(process.env.MADRASA_RADIUS || process.env.NEXT_PUBLIC_MADRASA_RADIUS || "200"),
  NAME: "আল-মদিনা ইসলামিক একাডেমি ক্যাম্পাস",
  ADDRESS: "বড় বাকাইল, সুহিলপুর, সদর, ব্রাহ্মণবাড়িয়া",
};

const ATTENDANCE_RULES = {
  OFFICE_START_HOUR: 8,
  OFFICE_START_MINUTE: 0,
  ON_TIME_CHECKIN_CUTOFF_HOUR: 8,
  ON_TIME_CHECKIN_CUTOFF_MINUTE: 5, // <= 8:05 AM is 'On Time', > 8:05 AM is 'Late'
  OFFICE_END_HOUR: 13,
  OFFICE_END_MINUTE: 10, // >= 1:10 PM is 'On Time' departure, < 1:10 PM is 'Early'
};

/**
 * Calculates distance between two GPS coordinates using the Haversine formula
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in meters
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== "number" ||
    typeof lon1 !== "number" ||
    typeof lat2 !== "number" ||
    typeof lon2 !== "number" ||
    isNaN(lat1) ||
    isNaN(lon1) ||
    isNaN(lat2) ||
    isNaN(lon2)
  ) {
    return Infinity;
  }

  const R = 6371e3; // Earth's mean radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Validates whether user coordinates are within the madrasa geofence radius
 * @param {number} userLat
 * @param {number} userLng
 * @param {number} [customRadius]
 * @returns {{ isInside: boolean, distance: number, threshold: number }}
 */
function isWithinMadrasaGeofence(userLat, userLng, customRadius = MADRASA_LOCATION.RADIUS_METERS) {
  const distance = calculateDistanceMeters(
    Number(userLat),
    Number(userLng),
    MADRASA_LOCATION.LATITUDE,
    MADRASA_LOCATION.LONGITUDE
  );

  return {
    isInside: distance <= customRadius,
    distance: Math.round(distance),
    threshold: customRadius,
  };
}

/**
 * Extract time parts in Asia/Dhaka timezone (UTC+6)
 * @param {Date|string|number} date
 */
function getDhakaTime(date = new Date()) {
  const dateObj = date instanceof Date ? date : new Date(date);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(dateObj);
  const map = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  const year = map.year;
  const month = map.month;
  const day = map.day;
  const hour = parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);

  const dateStr = `${year}-${month}-${day}`;
  const minutesSinceMidnight = hour * 60 + minute;

  return {
    dateStr,
    hour,
    minute,
    second,
    minutesSinceMidnight,
    formattedTime: `${hour.toString().padStart(2, "0")}:${minute
      .toString()
      .padStart(2, "0")}:${second.toString().padStart(2, "0")}`,
  };
}

/**
 * Evaluates arrival check-in status
 * @param {Date|string|number} date
 * @returns {'On Time'|'Late'}
 */
function evaluateCheckInStatus(date = new Date()) {
  const { minutesSinceMidnight } = getDhakaTime(date);
  const cutoffMinutes =
    ATTENDANCE_RULES.ON_TIME_CHECKIN_CUTOFF_HOUR * 60 +
    ATTENDANCE_RULES.ON_TIME_CHECKIN_CUTOFF_MINUTE;

  return minutesSinceMidnight <= cutoffMinutes ? "On Time" : "Late";
}

/**
 * Evaluates departure check-out status
 * @param {Date|string|number} date
 * @returns {'On Time'|'Early'}
 */
function evaluateCheckOutStatus(date = new Date()) {
  const { minutesSinceMidnight } = getDhakaTime(date);
  const cutoffMinutes =
    ATTENDANCE_RULES.OFFICE_END_HOUR * 60 +
    ATTENDANCE_RULES.OFFICE_END_MINUTE;

  return minutesSinceMidnight >= cutoffMinutes ? "On Time" : "Early";
}

module.exports = {
  MADRASA_LOCATION,
  ATTENDANCE_RULES,
  calculateDistanceMeters,
  isWithinMadrasaGeofence,
  getDhakaTime,
  evaluateCheckInStatus,
  evaluateCheckOutStatus,
};
