// Presentation-only enhancements for room labels, feedback colors, and tiebreaks.
const gamePresentationObserver = new MutationObserver(() => {
  const roomLabel = document.getElementById('room-label');
  if (roomLabel && /^ROOM (?!CODE:)/.test(roomLabel.textContent)) roomLabel.textContent = roomLabel.textContent.replace(/^ROOM /, 'ROOM CODE: ');

  const status = document.getElementById('status');
  if (status) {
    if (status.textContent.includes('Too early')) status.style.color = '#C96B16';
    else if (status.textContent.includes('Reaction recorded')) status.style.color = '#15845D';
    else status.style.color = '#008EAE';
  }

  const title = document.getElementById('title');
  const instruction = document.getElementById('instruction');
  const roundLabel = document.getElementById('round-label');
  const results = document.getElementById('results');
  if (!title || !instruction || !roundLabel || !results || !/ wins!$/.test(title.textContent) || !results.textContent.includes('Sudden-death winner') || results.dataset.suddenDeathShown === 'true') return;

  const winner = title.textContent.replace(/^🏆\s*/, '').replace(/ wins!$/, '').trim();
  const originalScores = results.querySelector('ol');
  if (!winner || !originalScores) return;

  results.dataset.suddenDeathShown = 'true';
  title.textContent = `🏆 ${winner} wins!`;
  title.style.color = '#39E6A5';
  roundLabel.textContent = 'SUDDEN DEATH';
  instruction.textContent = 'Fastest valid sudden-death reaction!';
  results.replaceChildren();

  const winnerHeading = document.createElement('h2');
  winnerHeading.textContent = 'Sudden-death winner:';
  winnerHeading.style.color = '#087C58';
  const winnerName = document.createElement('p');
  winnerName.textContent = winner;
  winnerName.style.fontSize = '1.8rem'; winnerName.style.fontWeight = '900'; winnerName.style.margin = '0 0 1.25rem'; winnerName.style.color = '#0B1224';
  const scoreHeading = document.createElement('h3'); scoreHeading.textContent = 'Final match score:';
  const note = document.createElement('p'); note.textContent = 'Sudden death broke the tie — no bonus points were added.'; note.style.fontWeight = '700'; note.style.fontSize = '.9rem';
  results.append(winnerHeading, winnerName, scoreHeading, originalScores, note);
});
gamePresentationObserver.observe(document.getElementById('app'), { childList: true, subtree: true, characterData: true });

