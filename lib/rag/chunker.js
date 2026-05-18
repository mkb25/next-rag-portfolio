import "server-only";

export function chunkText(text, chunkSize = 500, overlap = 50) {
  const paragraphs = text.split(/\n\n+/);
  const sentences = paragraphs.flatMap((p) => p.match(/[^.!?]+[.!?]+/g) || [p]);

  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    if (currentLength + words.length > chunkSize && currentLength > 0) {
      chunks.push(currentChunk.join(" "));

      let overlapChunk = [];
      let overlapLength = 0;
      for (let i = currentChunk.length - 1; i >= 0; i--) {
        const sentenceWords = currentChunk[i].split(/\s+/).filter(Boolean).length;
        if (overlapLength + sentenceWords > overlap && overlapLength > 0) {
          break;
        }
        overlapChunk.unshift(currentChunk[i]);
        overlapLength += sentenceWords;
      }

      currentChunk = [...overlapChunk];
      currentLength = overlapLength;
    }

    currentChunk.push(sentence.trim());
    currentLength += words.length;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks;
}
