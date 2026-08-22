export function averageQuotaCapacity(scores: readonly number[]): number | null {
  const validScores = scores.filter((score) => Number.isFinite(score));
  if (validScores.length === 0) return null;

  const total = validScores.reduce(
    (sum, score) => sum + Math.max(0, Math.min(1, score)),
    0
  );
  return total / validScores.length;
}
