// Infer only a small set of unambiguous, bounded printed linear exercises.
const names = {
  one_step: 'Solve one-step equations',
  two_step: 'Solve two-step equations',
  both_sides: 'Solve equations with variables on both sides',
  inequality: 'Solve linear inequalities'
};

function linearSide(text) {
  const tokens = text.match(/[+-]?(?:\d+x|x|\d+)/g);
  if (!tokens || tokens.join('') !== text || tokens.length > 2) return null;
  if (tokens.slice(1).some(token => !/^[-+]/.test(token))) return null;
  // Combining like terms is a different skill. Leave compound expressions alone.
  if (tokens.length === 2 && tokens[0].endsWith('x') === tokens[1].endsWith('x')) return null;
  let coefficient = 0, constant = 0;
  for (const token of tokens) {
    if (token.endsWith('x')) {
      const n = token.slice(0, -1);
      coefficient = n === '' || n === '+' ? 1 : n === '-' ? -1 : Number(n);
      if (!coefficient) return null;
    } else constant = Number(token);
  }
  if (Math.max(Math.abs(coefficient), Math.abs(constant)) > 10000) return null;
  return {coefficient, constant};
}

function skillFor(line) {
  const match = /^([^=<>≤≥]+)(=|<=|>=|<|>|≤|≥)([^=<>≤≥]+)$/.exec(line);
  if (!match) return;
  const left = linearSide(match[1]), right = linearSide(match[3]);
  if (!left || !right || left.coefficient === right.coefficient) return;
  if (match[2] !== '=') return 'inequality';
  if (left.coefficient && right.coefficient) return 'both_sides';
  const variable = left.coefficient ? left : right;
  if (variable.constant && Math.abs(variable.coefficient) !== 1) return 'two_step';
  // Already-solved examples (x = 5) aren't exercises.
  if (!variable.constant && variable.coefficient === 1) return;
  return 'one_step';
}

export function detectSourceTargets(text) {
  const targets = new Map();
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  // OCR may remove the space after a question number. Only strip a joined
  // numeric prefix in an ordered list starting at 1. Other decimals stay ambiguous.
  let expectedNumber = 1;
  for (const original of lines) {
    let line = original;
    const prefix = /^(\d+)([.)])(\s*)(.+)$/.exec(line);
    if (prefix && (prefix[3] || prefix[2] === ')' ||
        (Number(prefix[1]) === expectedNumber && (expectedNumber > 1 || /^x/i.test(prefix[4]))))) {
      expectedNumber = Number(prefix[1]) + 1;
      line = prefix[4];
    } else expectedNumber = 1;
    const skill = skillFor(line.replace(/^solve\s*:?\s*/i, '').replace(/[−–]/g, '-').replace(/\s/g, '').toLowerCase());
    if (!skill) continue;
    const target = targets.get(skill) || {kind:'skill', skillId:'algebra.linear.' + skill, title:names[skill], evidence:[]};
    if (target.evidence.length < 5) target.evidence.push(original.slice(0, 160));
    targets.set(skill, target);
  }
  return [...targets.values()];
}

export function isMathExercise(text) {
  return /[=<>≤≥]/.test(text) && /[\dxyz]/i.test(text);
}
