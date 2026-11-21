import {explicitPairs} from './source-pairs.js';
import {detectSourceTargets, isMathExercise} from './source-targets.js';

export const PHOTO_TEXT_LIMIT = 50000;

export function photoExtraction(text, {confidence = 0, excludedSkills = []} = {}) {
  if (!text.trim()) throw new Error('Type the missing text, try a clearer photo, or use this image as a Model.');
  if (text.length > PHOTO_TEXT_LIMIT) throw new Error('Use one page at a time, with at most 50,000 characters.');
  const targets = detectSourceTargets(text).filter(target => !excludedSkills.includes(target.skillId));
  const section = {
    locator: 'Image · checked text',
    text, reader: 'tesseract_7_eng',
    ocr_confidence: Math.max(0, Math.min(100, Number(confidence) || 0)),
    targets
  };
  // A worksheet heading such as "Algebra 1 - Practice Worksheet" isn't a pair.
  const headings = /\b(?:worksheet|study guide|test fixture|practice sheet)\b/i;
  const items = explicitPairs([section]).filter(item =>
    !isMathExercise(item.term) && !isMathExercise(item.answer) && !headings.test(item.excerpt));
  return {method:'explicit_pairs_v1', sections:[section], items,
    note:'Based on the printed text you checked. Review each suggested item before adding it to Study.'};
}

export function photoQuality(text, confidence) {
  if (!text.trim()) return 'No readable text was found. Type the text below or try a clearer photo.';
  if (!Number.isFinite(confidence) || confidence < 75) return 'Some text is unclear. Compare it with the image and correct any mistakes.';
  return 'Check names, numbers and math symbols against your photo.';
}
