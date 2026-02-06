const formatTimestamp = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  
  // Get timezone offset in GMT format (GMT+2, GMT-5, GMT+0)
  const tzOffset = -date.getTimezoneOffset();
  const tzSign = tzOffset >= 0 ? '+' : '-';
  const tzHours = Math.floor(Math.abs(tzOffset) / 60);
  const tzMinutes = Math.abs(tzOffset) % 60;
  const timezone = tzMinutes > 0 
    ? `GMT${tzSign}${tzHours}:${String(tzMinutes).padStart(2, '0')}`
    : `GMT${tzSign}${tzHours}`;
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms} ${timezone}`;
};

module.exports = { formatTimestamp };