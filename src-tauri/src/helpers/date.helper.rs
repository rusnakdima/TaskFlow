use chrono::{NaiveDate, Utc};
use serde_json::Value;

/// Parses a date string to NaiveDate
pub fn parseDate(dateStr: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(dateStr, "%Y-%m-%d").ok()
}

/// Parses a datetime string to NaiveDate
pub fn parseDateTime(dateTimeStr: &str) -> Option<NaiveDate> {
    dateTimeStr
        .split('T')
        .next()
        .and_then(|datePart| parseDate(datePart))
}

/// Extracts date from a JSON Value field
pub fn extractDateFromValue(value: &Value, field: &str) -> Option<NaiveDate> {
    value.get(field).and_then(|v| v.as_str()).and_then(parseDateTime)
}

/// Checks if a date is within a range
pub fn isDateInRange(date: &NaiveDate, startDate: &NaiveDate, endDate: &NaiveDate) -> bool {
    date >= startDate && date <= endDate
}

/// Filters items by date range
pub fn filterByDateRange<F>(
    items: &[Value],
    startDate: &NaiveDate,
    endDate: &NaiveDate,
    dateFieldExtractor: F,
) -> Vec<Value>
where
    F: Fn(&Value) -> Option<NaiveDate>,
{
    items
        .iter()
        .filter(|item| {
            dateFieldExtractor(item)
                .map(|date| isDateInRange(&date, startDate, endDate))
                .unwrap_or(false)
        })
        .cloned()
        .collect()
}

/// Filters items by date range using a specific field name
pub fn filterByDateRangeWithField(
    items: &[Value],
    startDate: &NaiveDate,
    endDate: &NaiveDate,
    fieldName: &str,
) -> Vec<Value> {
    filterByDateRange(items, startDate, endDate, |item| {
        extractDateFromValue(item, fieldName)
    })
}

/// Gets the current date
pub fn getCurrentDate() -> NaiveDate {
    Utc::now().date_naive()
}
