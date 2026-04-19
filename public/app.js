const form = document.getElementById('analyzer-form');
const resumeInput = document.getElementById('resume');
const jobInput = document.getElementById('job');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const analyzeButton = document.getElementById('analyze-button');

const atsOutput = document.getElementById('ats-output');
const feedbackOutput = document.getElementById('feedback-output');
const optimizedOutput = document.getElementById('optimized-output');
const questionsOutput = document.getElementById('questions-output');
const answersOutput = document.getElementById('answers-output');
const gapsOutput = document.getElementById('gaps-output');

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#dc2626' : '';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p>No content available.</p>';
  }

  return `<ol class="list-block">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')}</ol>`;
}

function renderSuggestedAnswers(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p>No content available.</p>';
  }

  return `<div class="answer-grid">${items
    .map(
      (item) => `
        <div class="answer-card">
          <strong>${escapeHtml(item.question || 'Suggested answer')}</strong>
          <div>${escapeHtml(item.answer || '')}</div>
        </div>
      `
    )
    .join('')}</div>`;
}

async function copyFromTarget(targetId, button) {
  const element = document.getElementById(targetId);
  if (!element) {
    return;
  }

  try {
    await navigator.clipboard.writeText(element.innerText.trim());
    const previous = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => {
      button.textContent = previous;
    }, 1400);
  } catch (error) {
    button.textContent = 'Failed';
    setTimeout(() => {
      button.textContent = 'Copy';
    }, 1400);
  }
}

document.querySelectorAll('.copy-button').forEach((button) => {
  button.addEventListener('click', () => {
    copyFromTarget(button.dataset.copyTarget, button);
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const resume = resumeInput.value.trim();
  const job = jobInput.value.trim();

  if (!resume || !job) {
    setStatus('Please paste both the resume and the job description.', true);
    resultsEl.classList.add('hidden');
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = 'Analyzing...';
  setStatus('Analyzing resume fit and interview readiness...');
  resultsEl.classList.add('hidden');

  try {
    const response = await fetch('/analyzeResume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ resume, job })
    });

    const rawBody = await response.text();
    let data = {};

    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch (parseError) {
      throw new Error('Server returned an invalid response.');
    }

    if (!response.ok) {
      throw new Error(data.details ? `${data.error}: ${data.details}` : data.error || 'Request failed.');
    }

    atsOutput.textContent = typeof data.ats_score === 'number' ? `${data.ats_score}/100` : '--';
    feedbackOutput.innerHTML = renderList(data.resume_feedback);
    optimizedOutput.textContent = data.optimized_resume || '';
    questionsOutput.innerHTML = renderList(data.interview_questions);
    answersOutput.innerHTML = renderSuggestedAnswers(data.suggested_answers);
    gapsOutput.innerHTML = renderList(data.skill_gaps);

    resultsEl.classList.remove('hidden');
    setStatus('Analysis complete. Your interview prep materials are ready.');
  } catch (error) {
    setStatus(error.message || 'Something went wrong while analyzing the resume.', true);
    resultsEl.classList.add('hidden');
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = 'Analyze Resume';
  }
});
