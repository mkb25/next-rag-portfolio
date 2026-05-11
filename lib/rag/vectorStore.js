import "server-only";

function cosineSimilarity(first, second) {
  const dotProduct = first.reduce(
    (sum, value, index) => sum + value * second[index],
    0,
  );
  const firstMagnitude = Math.sqrt(
    first.reduce((sum, value) => sum + value * value, 0),
  );
  const secondMagnitude = Math.sqrt(
    second.reduce((sum, value) => sum + value * value, 0),
  );

  return dotProduct / (firstMagnitude * secondMagnitude);
}

export class VectorStore {
  constructor() {
    this.documents = [];
  }

  addDocuments(chunks, embeddings) {
    chunks.forEach((text, index) => {
      this.documents.push({ text, embedding: embeddings[index] });
    });
  }

  search(queryEmbedding, topK = 5) {
    return this.documents
      .map((document) => ({
        text: document.text,
        score: cosineSimilarity(queryEmbedding, document.embedding),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }
}
