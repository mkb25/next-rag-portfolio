import "server-only";

export function chunkText(text, chunkSize = 500, overlap = 50) {
  const words = text.split(/\s+/);
  const chunks = [];

  for (let index = 0; index < words.length; index += chunkSize - overlap) {
    const chunk = words.slice(index, index + chunkSize).join(" ");
    if (chunk.trim()) {
      chunks.push(chunk);
    }
    if (index + chunkSize >= words.length) {
      break;
    }
  }

  return chunks;
}
