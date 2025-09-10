/**
 * Generate UUID tương thích với browser environment
 * Sử dụng Web Crypto API nếu có sẵn, fallback về Math.random()
 */
export function generateUUID(): string {
  // Kiểm tra nếu có Web Crypto API (modern browsers)
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  // Kiểm tra nếu có crypto.getRandomValues (fallback)
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    // Generate UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    
    // Set version (4) and variant bits
    array[6] = (array[6] & 0x0f) | 0x40; // Version 4
    array[8] = (array[8] & 0x3f) | 0x80; // Variant 10

    // Convert to hex string with dashes
    const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32)
    ].join('-');
  }

  // Fallback sử dụng Math.random() (không an toàn hoàn toàn nhưng đủ cho game)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
