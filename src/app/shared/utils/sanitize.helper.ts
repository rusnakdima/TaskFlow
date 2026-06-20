const SENSITIVE_KEYS = [
  "password",
  "confirmPassword",
  "confirm_password",
  "token",
  "secret",
  "apiKey",
  "api_key",
  "authorization",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "privateKey",
  "private_key",
  "sessionId",
  "session_id",
  "cookie",
];
const PARTIAL_EMAIL_KEYS = ["email", "mail"];
const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_LENGTH = 50;
const CHAT_CONTENT_PREVIEW = 50;
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive.toLowerCase()));
}
function isEmailKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return PARTIAL_EMAIL_KEYS.some((emailKey) => lowerKey.includes(emailKey.toLowerCase()));
}
function partialEmail(email: string): string {
  if (!email || typeof email !== "string") return "[REDACTED]";
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return "[REDACTED]";
  const localPart = email.substring(0, atIndex);
  const domain = email.substring(atIndex);
  if (localPart.length <= 1) return "[REDACTED]";
  return `${localPart[0]}***${domain}`;
}
function truncateString(str: string, maxLength: number): string {
  if (!str || typeof str !== "string") return "[REDACTED]";
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + "...";
}
function sanitizeValue(key: string, value: unknown): unknown {
  if (isSensitiveKey(key)) {
    return "[REDACTED]";
  }
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    if (isEmailKey(key)) {
      return partialEmail(value);
    }
    return truncateString(value, MAX_STRING_LENGTH);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => {
      if (typeof item === "object" && item !== null) {
        return sanitizeData(item);
      }
      return item;
    });
  }
  if (typeof value === "object") {
    return sanitizeData(value);
  }
  return "[REDACTED]";
}
export function sanitizeData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return null;
  }
  if (Array.isArray(data)) {
    return data.map((item) => {
      if (typeof item === "object" && item !== null) {
        return sanitizeData(item);
      }
      return item;
    });
  }
  if (typeof data !== "object") {
    return data;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = sanitizeValue(key, value);
  }
  return result;
}
export function sanitizeChatContent(content: string): string {
  if (!content || typeof content !== "string") return "[EMPTY]";
  if (content.length <= CHAT_CONTENT_PREVIEW) return content;
  return content.substring(0, CHAT_CONTENT_PREVIEW) + "...";
}
export function sanitizeRequestBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return null;
  const sanitized: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of Object.keys(sanitized)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (key === "password" || key.includes("password")) {
      sanitized[key] = "[REDACTED]";
    } else if (key === "content" && typeof sanitized[key] === "string") {
      sanitized[key] = sanitizeChatContent(sanitized[key] as string);
    }
  }
  return sanitized;
}
export function sanitizeApiResponse(data: unknown): unknown {
  if (!data || typeof data !== "object") return null;
  const dataRecord = data as Record<string, unknown>;
  if (dataRecord["data"] && typeof dataRecord["data"] === "object") {
    return {
      ...dataRecord,
      data: sanitizeData(dataRecord["data"]),
    };
  }
  return sanitizeData(data);
}
