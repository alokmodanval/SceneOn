import { MatchScoreResult, SceneUser, VibeSliders } from '../types';

export function calculateSceneMatch(userA?: SceneUser | null, userB?: SceneUser | null): MatchScoreResult {
  if (!userA || !userB) {
    return { totalMatch: 65, tagSimilarity: 50, sliderCloseness: 75, commonTags: [] };
  }

  // 1. Jaccard similarity on interest tags (60% weight)
  const tagsA = new Set(userA.tags || []);
  const tagsB = new Set(userB.tags || []);
  
  const commonTags = (userA.tags || []).filter(tag => tagsB.has(tag));
  const unionTags = new Set([...userA.tags || [], ...userB.tags || []]);

  let tagSimilarity = 0;
  if (unionTags.size > 0) {
    tagSimilarity = (commonTags.length / unionTags.size) * 100;
  }

  // 2. Normalized Euclidean closeness on the 3 sliders (40% weight)
  const slidersA: VibeSliders = userA.sliders || { talk: 50, owl: 50, hustle: 50 };
  const slidersB: VibeSliders = userB.sliders || { talk: 50, owl: 50, hustle: 50 };

  const dTalk = (slidersA.talk ?? 50) - (slidersB.talk ?? 50);
  const dOwl = (slidersA.owl ?? 50) - (slidersB.owl ?? 50);
  const dHustle = (slidersA.hustle ?? 50) - (slidersB.hustle ?? 50);

  const dist = Math.sqrt(dTalk * dTalk + dOwl * dOwl + dHustle * dHustle);
  const maxDist = Math.sqrt(100 * 100 + 100 * 100 + 100 * 100); // ~173.2

  const sliderCloseness = Math.max(0, Math.min(100, (1 - dist / maxDist) * 100));

  // 3. Weighted total score (60% tags + 40% sliders)
  const rawTotal = (0.60 * tagSimilarity) + (0.40 * sliderCloseness);

  // Clamp between 15% and 99% (as per spec: 0% to 99%)
  const totalMatch = Math.min(99, Math.max(15, Math.round(rawTotal)));

  return {
    totalMatch,
    tagSimilarity: Math.round(tagSimilarity),
    sliderCloseness: Math.round(sliderCloseness),
    commonTags,
  };
}

// Get badge color styling based on match percentage
export function getMatchBadgeStyle(percentage: number): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  if (percentage >= 85) {
    return {
      bg: 'bg-[#CCFF00]/15',
      text: 'text-[#CCFF00]',
      border: 'border-[#CCFF00]/50',
      label: '⚡ Peak Vibe Match',
    };
  }
  if (percentage >= 70) {
    return {
      bg: 'bg-violet-500/15',
      text: 'text-violet-400',
      border: 'border-violet-500/50',
      label: '✨ High Resonance',
    };
  }
  if (percentage >= 50) {
    return {
      bg: 'bg-cyan-500/15',
      text: 'text-cyan-400',
      border: 'border-cyan-500/50',
      label: '🌊 Good Scene',
    };
  }
  return {
    bg: 'bg-pink-500/15',
    text: 'text-pink-400',
    border: 'border-pink-500/50',
    label: '🎲 Random Spark',
  };
}
