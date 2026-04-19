const form = document.getElementById('analyzer-form');
const resumeFileInput = document.getElementById('resumeFile');
const resumeTextInput = document.getElementById('resumeText');
const uploadZone = document.getElementById('upload-zone');
const fileNameEl = document.getElementById('file-name');
const jobInput = document.getElementById('job');
const analyzeButton = document.getElementById('analyze-button');
const exportPdfButton = document.getElementById('export-pdf-button');
const statusBanner = document.getElementById('status-banner');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const resultsEl = document.getElementById('results');
const toastEl = document.getElementById('toast');

const atsOutput = document.getElementById('ats-output');
const technicalOutput = document.getElementById('technical-output');
const matchedOutput = document.getElementById('matched-output');
const missingOutput = document.getElementById('missing-output');
const hardFiltersOutput = document.getElementById('hard-filters-output');
const weakEvidenceOutput = document.getElementById('weak-evidence-output');
const verdictOutput = document.getElementById('verdict-output');
const evidenceOutput = document.getElementById('evidence-output');
const risksOutput = document.getElementById('risks-output');
const technicalQuestionsOutput = document.getElementById('technical-questions-output');
const systemDesignOutput = document.getElementById('system-design-output');
const behavioralOutput = document.getElementById('behavioral-output');
const mockOutput = document.getElementById('mock-output');
const rejectionsOutput = document.getElementById('rejections-output');
const strengthsOutput = document.getElementById('strengths-output');
const confidenceOutput = document.getElementById('confidence-output');

let latestResult = null;
let toastTimer = null;

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

  return `<ol class="list-block">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
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

function renderEvidenceNotes(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p>No content available.</p>';
  }

  return `<div class="answer-grid">${items
    .map(
      (item) => `
        <div class="answer-card">
          <strong>${escapeHtml(item.skill || 'Unknown skill')}</strong>
          <div>${escapeHtml(item.proof || 'NO EVIDENCE FOUND')}</div>
          <div><em>Confidence: ${escapeHtml(item.confidence || 'none')}</em></div>
        </div>
      `
    )
    .join('')}</div>`;
}

function renderQuestionCards(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p>No content available.</p>';
  }

  return `<div class="answer-grid">${items
    .map(
      (item) => `
        <div class="answer-card">
          <strong>${escapeHtml(item.question || 'Question')}</strong>
          <div><em>Difficulty: ${escapeHtml(item.difficulty || 'not specified')}</em></div>
          <div>${escapeHtml(item.why_asked || 'No rationale provided.')}</div>
          <div><strong>Strong answer should include:</strong> ${escapeHtml(
            item.strong_answer_should_include || 'No guidance provided.'
          )}</div>
        </div>
      `
    )
    .join('')}</div>`;
}

function renderMockInterview(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p>No content available.</p>';
  }

  return `<div class="answer-grid">${items
    .map(
      (item) => `
        <div class="answer-card">
          <strong>${escapeHtml(item.category || 'Interview')}</strong>
          <div><strong>Question:</strong> ${escapeHtml(item.question || '')}</div>
          <div><strong>Weak answer:</strong> ${escapeHtml(item.weak_answer || '')}</div>
          <div><strong>Average answer:</strong> ${escapeHtml(item.average_answer || '')}</div>
          <div><strong>Strong answer:</strong> ${escapeHtml(item.strong_answer || '')}</div>
          <div><strong>Interviewer evaluation:</strong> ${escapeHtml(item.interviewer_evaluation || '')}</div>
          <div><strong>Result:</strong> ${escapeHtml(item.result || '')}</div>
        </div>
      `
    )
    .join('')}</div>`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 1800);
}

function showError(message) {
  statusBanner.textContent = message;
  statusBanner.classList.remove('hidden');
}

function clearError() {
  statusBanner.textContent = '';
  statusBanner.classList.add('hidden');
}

function setLoading(isLoading) {
  analyzeButton.disabled = isLoading;
  analyzeButton.textContent = isLoading ? 'Analyzing...' : 'Analyze Resume';
  loadingState.classList.toggle('hidden', !isLoading);

  if (isLoading) {
    resultsEl.classList.add('hidden');
    emptyState.classList.add('hidden');
    exportPdfButton.disabled = true;
  } else if (!latestResult) {
    emptyState.classList.remove('hidden');
  }
}

function updateFileName() {
  const file = resumeFileInput.files && resumeFileInput.files[0];
  fileNameEl.textContent = file ? `${file.name} selected` : 'No file selected';
}

function flattenText(value) {
  return String(value || '').replace(/\n{3,}/g, '\n\n').trim();
}

function getSectionText(targetId) {
  const element = document.getElementById(targetId);
  return element ? element.innerText.trim() : '';
}

async function copyFromTarget(targetId) {
  const content = getSectionText(targetId);
  if (!content) {
    return;
  }

  try {
    await navigator.clipboard.writeText(content);
    showToast('Copied!');
  } catch (error) {
    showError('Copy failed. Please try again.');
  }
}

function renderResults(data) {
  latestResult = data;
  atsOutput.textContent = typeof data.ats_score === 'number' ? `${data.ats_score}/100` : '--';
  technicalOutput.textContent = typeof data.technical_score === 'number' ? `${data.technical_score}/100` : '--';
  matchedOutput.innerHTML = renderList(data.matched_keywords);
  missingOutput.innerHTML = renderList(data.missing_keywords);
  hardFiltersOutput.innerHTML = renderList(data.hard_filter_failures);
  weakEvidenceOutput.innerHTML = renderList(data.weak_evidence_skills);
  verdictOutput.textContent = data.final_verdict || '';
  evidenceOutput.innerHTML = renderEvidenceNotes(data.evidence_notes);
  risksOutput.innerHTML = renderList(data.risk_flags);
  technicalQuestionsOutput.innerHTML = renderQuestionCards(data.technical_questions);
  systemDesignOutput.innerHTML = renderQuestionCards(data.system_design_questions);
  behavioralOutput.innerHTML = renderQuestionCards(data.behavioral_questions);
  mockOutput.innerHTML = renderMockInterview(data.mock_interview);
  rejectionsOutput.innerHTML = renderList(data.rejection_reasons);
  strengthsOutput.innerHTML = renderList(data.top_strengths);
  confidenceOutput.textContent = typeof data.confidence_score === 'number' ? `${data.confidence_score}/100` : '--';

  loadingState.classList.add('hidden');
  emptyState.classList.add('hidden');
  resultsEl.classList.remove('hidden');
  exportPdfButton.disabled = false;
}

function exportPdf() {
  if (!latestResult || !window.jspdf || !window.jspdf.jsPDF) {
    showError('Nothing to export yet.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 46;
  const usableWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureRoom = (needed = 24) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const addTitle = (text) => {
    ensureRoom(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text(text, margin, y);
    y += 28;
  };

  const addSection = (title, body) => {
    const lines = Array.isArray(body) ? body : doc.splitTextToSize(String(body || ''), usableWidth);
    ensureRoom(28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(title, margin, y);
    y += 18;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);

    lines.forEach((line) => {
      ensureRoom(16);
      doc.text(line, margin, y);
      y += 15;
    });

    y += 10;
  };

  addTitle('InterviewIQ Report');
  addSection('ATS Score', [`${latestResult.ats_score}/100`]);
  addSection('Technical Score', [`${latestResult.technical_score}/100`]);
  addSection(
    'Matched Keywords',
    latestResult.matched_keywords.flatMap((item) => doc.splitTextToSize(`• ${item}`, usableWidth))
  );
  addSection(
    'Missing Keywords',
    latestResult.missing_keywords.flatMap((item) => doc.splitTextToSize(`• ${item}`, usableWidth))
  );
  addSection(
    'Hard Filter Failures',
    latestResult.hard_filter_failures.flatMap((item) => doc.splitTextToSize(`• ${item}`, usableWidth))
  );
  addSection(
    'Weak Evidence Skills',
    latestResult.weak_evidence_skills.flatMap((item) => doc.splitTextToSize(`• ${item}`, usableWidth))
  );
  addSection(
    'Evidence Notes',
    latestResult.evidence_notes.flatMap((item) =>
      doc.splitTextToSize(
        `Skill: ${item.skill}\nProof: ${item.proof}\nConfidence: ${item.confidence}`,
        usableWidth
      ).concat([''])
    )
  );
  addSection('Risk Flags', latestResult.risk_flags.flatMap((item) => doc.splitTextToSize(`• ${item}`, usableWidth)));
  addSection(
    'Technical Questions',
    latestResult.technical_questions.flatMap((item) =>
      doc.splitTextToSize(
        `Q: ${item.question}\nDifficulty: ${item.difficulty}\nWhy asked: ${item.why_asked}\nStrong answer should include: ${item.strong_answer_should_include}`,
        usableWidth
      ).concat([''])
    )
  );
  addSection(
    'System Design Questions',
    latestResult.system_design_questions.flatMap((item) =>
      doc.splitTextToSize(
        `Q: ${item.question}\nDifficulty: ${item.difficulty}\nWhy asked: ${item.why_asked}\nStrong answer should include: ${item.strong_answer_should_include}`,
        usableWidth
      ).concat([''])
    )
  );
  addSection(
    'Behavioral Questions',
    latestResult.behavioral_questions.flatMap((item) =>
      doc.splitTextToSize(
        `Q: ${item.question}\nDifficulty: ${item.difficulty}\nWhy asked: ${item.why_asked}\nStrong answer should include: ${item.strong_answer_should_include}`,
        usableWidth
      ).concat([''])
    )
  );
  addSection(
    'Mock Interview Simulation',
    latestResult.mock_interview.flatMap((item) =>
      doc.splitTextToSize(
        `Category: ${item.category}\nQuestion: ${item.question}\nWeak answer: ${item.weak_answer}\nAverage answer: ${item.average_answer}\nStrong answer: ${item.strong_answer}\nInterviewer evaluation: ${item.interviewer_evaluation}\nResult: ${item.result}`,
        usableWidth
      ).concat([''])
    )
  );
  addSection(
    'Top Rejection Reasons',
    latestResult.rejection_reasons.flatMap((item) => doc.splitTextToSize(`• ${item}`, usableWidth))
  );
  addSection(
    'Top Strengths',
    latestResult.top_strengths.flatMap((item) => doc.splitTextToSize(`• ${item}`, usableWidth))
  );
  addSection('Confidence Score', [`${latestResult.confidence_score}/100`]);
  addSection('Final Verdict', [String(latestResult.final_verdict || '').toUpperCase()]);

  doc.save('interviewiq-report.pdf');
}

resumeFileInput.addEventListener('change', updateFileName);

['dragenter', 'dragover'].forEach((eventName) => {
  uploadZone.addEventListener(eventName, () => {
    uploadZone.classList.add('is-active');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  uploadZone.addEventListener(eventName, () => {
    uploadZone.classList.remove('is-active');
  });
});

uploadZone.addEventListener('dragover', (event) => {
  event.preventDefault();
});

uploadZone.addEventListener('drop', (event) => {
  event.preventDefault();
  const files = event.dataTransfer && event.dataTransfer.files;
  if (!files || !files.length) {
    return;
  }

  resumeFileInput.files = files;
  updateFileName();
});

document.querySelectorAll('.copy-button').forEach((button) => {
  button.addEventListener('click', () => {
    copyFromTarget(button.dataset.copyTarget);
  });
});

exportPdfButton.addEventListener('click', exportPdf);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const file = resumeFileInput.files && resumeFileInput.files[0];
  const resumeText = resumeTextInput.value.trim();
  const job = jobInput.value.trim();

  if (!file && !resumeText) {
    showError('Please upload a PDF or TXT resume, or paste the resume text before analyzing.');
    return;
  }

  if (!job) {
    showError('Please paste the job description before analyzing.');
    return;
  }

  setLoading(true);

  try {
    let response;

    if (file) {
      const formData = new FormData();
      formData.append('resumeFile', file);
      formData.append('job', job);

      response = await fetch('/uploadResumeAndAnalyze', {
        method: 'POST',
        body: formData
      });
    } else {
      response = await fetch('/analyzeResume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          resume: resumeText,
          job
        })
      });
    }

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

    renderResults(data);
  } catch (error) {
    latestResult = null;
    resultsEl.classList.add('hidden');
    emptyState.classList.remove('hidden');
    showError(error.message || 'Failed to analyze the resume.');
  } finally {
    setLoading(false);
  }
});
