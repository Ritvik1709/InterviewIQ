const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowedTypes = new Set(['application/pdf', 'text/plain']);
    const lowerName = String(file.originalname || '').toLowerCase();
    const isAllowedName = lowerName.endsWith('.pdf') || lowerName.endsWith('.txt');
    const isAllowedType = allowedTypes.has(file.mimetype) || file.mimetype === 'application/octet-stream';

    if (!isAllowedName || !isAllowedType) {
      return cb(new Error('Only PDF and TXT resume files are supported.'));
    }

    return cb(null, true);
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
    if (fencedMatch) {
      return JSON.parse(fencedMatch[1].trim());
    }
    throw error;
  }
}

function getErrorDetails(error) {
  if (error.response && error.response.data) {
    if (typeof error.response.data === 'string') {
      return error.response.data;
    }

    if (error.response.data.error && error.response.data.error.message) {
      return error.response.data.error.message;
    }

    try {
      return JSON.stringify(error.response.data);
    } catch (stringifyError) {
      return String(error.message || 'Unknown error');
    }
  }

  return String(error.message || 'Unknown error');
}

function normalizeOutput(payload) {
  const atsScore = Number(payload.ats_score);
  const technicalScore = Number(payload.technical_score);
  const matchedKeywords = Array.isArray(payload.matched_keywords)
    ? payload.matched_keywords.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const missingKeywords = Array.isArray(payload.missing_keywords)
    ? payload.missing_keywords.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const hardFilterFailures = Array.isArray(payload.hard_filter_failures)
    ? payload.hard_filter_failures.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const weakEvidenceSkills = Array.isArray(payload.weak_evidence_skills)
    ? payload.weak_evidence_skills.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const evidenceNotes = Array.isArray(payload.evidence_notes)
    ? payload.evidence_notes
        .map((item) => {
          if (item && typeof item === 'object') {
            return {
              skill: String(item.skill || '').trim(),
              proof: String(item.proof || '').trim(),
              confidence: String(item.confidence || '').trim().toLowerCase()
            };
          }

          return {
            skill: '',
            proof: String(item || '').trim(),
            confidence: 'none'
          };
        })
        .filter((item) => item.skill || item.proof)
    : [];
  const riskFlags = Array.isArray(payload.risk_flags)
    ? payload.risk_flags.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const technicalQuestions = Array.isArray(payload.technical_questions)
    ? payload.technical_questions.map(normalizeQuestionItem).filter(isQuestionItemUseful)
    : [];
  const systemDesignQuestions = Array.isArray(payload.system_design_questions)
    ? payload.system_design_questions.map(normalizeQuestionItem).filter(isQuestionItemUseful)
    : [];
  const behavioralQuestions = Array.isArray(payload.behavioral_questions)
    ? payload.behavioral_questions.map(normalizeQuestionItem).filter(isQuestionItemUseful)
    : [];
  const mockInterview = Array.isArray(payload.mock_interview)
    ? payload.mock_interview.map(normalizeMockInterviewItem).filter(isMockInterviewUseful)
    : [];
  const rejectionReasons = Array.isArray(payload.rejection_reasons)
    ? payload.rejection_reasons.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const topStrengths = Array.isArray(payload.top_strengths)
    ? payload.top_strengths.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const confidenceScore = Number(payload.confidence_score);
  const finalVerdict = String(payload.final_verdict || '').trim().toLowerCase();

  return {
    ats_score: Number.isFinite(atsScore) ? Math.max(0, Math.min(100, Math.round(atsScore))) : null,
    technical_score: Number.isFinite(technicalScore) ? Math.max(0, Math.min(100, Math.round(technicalScore))) : null,
    matched_keywords: matchedKeywords,
    missing_keywords: missingKeywords,
    hard_filter_failures: hardFilterFailures,
    weak_evidence_skills: weakEvidenceSkills,
    evidence_notes: evidenceNotes,
    risk_flags: riskFlags,
    technical_questions: technicalQuestions,
    system_design_questions: systemDesignQuestions,
    behavioral_questions: behavioralQuestions,
    mock_interview: mockInterview,
    rejection_reasons: rejectionReasons,
    top_strengths: topStrengths,
    confidence_score: Number.isFinite(confidenceScore)
      ? Math.max(0, Math.min(100, Math.round(confidenceScore)))
      : null,
    final_verdict: ['hire', 'reject', 'borderline'].includes(finalVerdict) ? finalVerdict : ''
  };
}

function normalizeQuestionItem(item) {
  if (!item || typeof item !== 'object') {
    return {
      question: String(item || '').trim(),
      difficulty: '',
      why_asked: '',
      strong_answer_should_include: ''
    };
  }

  return {
    question: String(item.question || '').trim(),
    difficulty: String(item.difficulty || '').trim().toLowerCase(),
    why_asked: String(item.why_asked || '').trim(),
    strong_answer_should_include: String(item.strong_answer_should_include || '').trim()
  };
}

function isQuestionItemUseful(item) {
  return item.question || item.why_asked || item.strong_answer_should_include;
}

function normalizeMockInterviewItem(item) {
  if (!item || typeof item !== 'object') {
    return {
      category: '',
      question: String(item || '').trim(),
      weak_answer: '',
      average_answer: '',
      strong_answer: '',
      interviewer_evaluation: '',
      result: ''
    };
  }

  return {
    category: String(item.category || '').trim(),
    question: String(item.question || '').trim(),
    weak_answer: String(item.weak_answer || '').trim(),
    average_answer: String(item.average_answer || '').trim(),
    strong_answer: String(item.strong_answer || '').trim(),
    interviewer_evaluation: String(item.interviewer_evaluation || '').trim(),
    result: String(item.result || '').trim()
  };
}

function isMockInterviewUseful(item) {
  return item.question || item.interviewer_evaluation || item.result;
}

async function extractResumeText(file) {
  const fileName = String(file.originalname || '').toLowerCase();

  if (fileName.endsWith('.txt')) {
    return file.buffer.toString('utf8').trim();
  }

  if (fileName.endsWith('.pdf')) {
    const parsed = await pdfParse(file.buffer);
    return String(parsed.text || '').trim();
  }

  throw new Error('Unsupported file type.');
}

async function analyzeWithGemini(resumeText, jobDescription) {
  const prompt = [
    'You are a SENIOR STAFF-LEVEL Hiring Simulator System combining an ATS system, technical recruiter, FAANG-level software engineering interviewer, system design interviewer, and behavioral interviewer.',
    '',
    'CORE RULES:',
    '- Do NOT be optimistic.',
    '- Do NOT assume skills not explicitly proven.',
    '- Do NOT inflate experience.',
    '- Do NOT give generic advice unless explicitly asked.',
    '- Every output must be evidence-based.',
    '- If no proof exists, mark it as NOT DEMONSTRATED.',
    '',
    'FORBIDDEN BEHAVIOR:',
    '- Do not rewrite resumes.',
    '- Do not suggest improvements unless explicitly asked.',
    '- Do not assume skills from projects unless explicitly stated.',
    '- Do not inflate technical depth.',
    '- Do not hallucinate experience.',
    '',
    'STAGE 1: ATS SCREENING',
    '- Output ATS score 0-100.',
    '- Include matched keywords using exact or near-exact matches only.',
    '- Include missing keywords.',
    '- Include hard filter failures for critical missing requirements.',
    '',
    'STAGE 2: RECRUITER EVALUATION',
    '- Evaluate technical depth, project credibility, evidence strength, and role fit.',
    '- Output technical score 0-100.',
    '- Output weak evidence skills.',
    '- Output risk flags explaining why a recruiter would reject.',
    '- Every conclusion must be evidence-based.',
    '',
    'STAGE 3: INTERVIEW QUESTION GENERATION',
    '- Generate 5 to 8 technical questions based only on the resume and job description.',
    '- Each technical question must include difficulty, why it is asked, and what a strong answer would include.',
    '- Generate 2 to 3 system design questions only if the job clearly requires backend or system knowledge.',
    '- Generate 4 to 6 behavioral questions based on leadership, teamwork, failures, or ambiguity.',
    '',
    'STAGE 4: MOCK INTERVIEW SIMULATION',
    '- For each question in the mock interview, provide weak answer, average answer, strong answer, interviewer evaluation, and Pass/Borderline/Fail.',
    '- Keep the evaluation strict and realistic.',
    '',
    'STAGE 5: FINAL HIRING DECISION',
    '- Output final verdict as Hire, Reject, or Borderline.',
    '- Output top 3 rejection reasons if rejected or borderline risks exist.',
    '- Output top 3 strengths only if evidence exists.',
    '- Output confidence score 0-100.',
    '',
    'EVIDENCE MAPPING:',
    '- For every important skill, provide the skill name, exact resume quote or reference, and why it does or does not count.',
    '- If no evidence exists, explicitly say NOT DEMONSTRATED or NO EVIDENCE FOUND.',
    '',
    'Return valid JSON only with this exact shape:',
    '{',
    '  "ats_score": 0,',
    '  "technical_score": 0,',
    '  "matched_keywords": ["keyword 1", "keyword 2"],',
    '  "missing_keywords": ["keyword 1", "keyword 2"],',
    '  "hard_filter_failures": ["critical gap 1", "critical gap 2"],',
    '  "weak_evidence_skills": ["skill 1", "skill 2"],',
    '  "evidence_notes": [',
    '    {',
    '      "skill": "Node.js",',
    '      "proof": "Built REST APIs in Node.js for internal tooling",',
    '      "confidence": "high"',
    '    }',
    '  ],',
    '  "risk_flags": ["risk 1", "risk 2"],',
    '  "technical_questions": [',
    '    {',
    '      "question": "technical question",',
    '      "difficulty": "easy | medium | hard",',
    '      "why_asked": "why this is asked",',
    '      "strong_answer_should_include": "what a strong answer would include"',
    '    }',
    '  ],',
    '  "system_design_questions": [',
    '    {',
    '      "question": "system design question",',
    '      "difficulty": "medium | hard",',
    '      "why_asked": "why this is asked",',
    '      "strong_answer_should_include": "what a strong answer would include"',
    '    }',
    '  ],',
    '  "behavioral_questions": [',
    '    {',
    '      "question": "behavioral question",',
    '      "difficulty": "easy | medium",',
    '      "why_asked": "why this is asked",',
    '      "strong_answer_should_include": "what a strong answer would include"',
    '    }',
    '  ],',
    '  "mock_interview": [',
    '    {',
    '      "category": "technical | system design | behavioral",',
    '      "question": "question text",',
    '      "weak_answer": "weak answer example",',
    '      "average_answer": "average answer example",',
    '      "strong_answer": "strong answer example",',
    '      "interviewer_evaluation": "strict evaluation",',
    '      "result": "Pass | Borderline | Fail"',
    '    }',
    '  ],',
    '  "rejection_reasons": ["reason 1", "reason 2", "reason 3"],',
    '  "top_strengths": ["strength 1", "strength 2", "strength 3"],',
    '  "confidence_score": 0,',
    '  "final_verdict": "Hire | Reject | Borderline"',
    '}',
    '',
    'Output requirements:',
    '- Use strict evidence-based judgment.',
    '- Do not help the candidate or coach them.',
    '- Every listed skill judgment must be grounded in resume text.',
    '- Do not omit a stage unless it truly does not apply.',
    '- If system design is not relevant, return an empty array for system_design_questions.',
    '- If evidence is missing, say NOT DEMONSTRATED or NO EVIDENCE FOUND.',
    '',
    'Resume:',
    resumeText,
    '',
    'Job description:',
    jobDescription
  ].join('\n');

  const response = await callGeminiWithRetry({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: 'application/json'
    }
  });

  const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Gemini returned no candidate text.');
  }

  const parsed = safeJsonParse(rawText);
  const result = normalizeOutput(parsed);

  if (
    result.ats_score === null ||
    result.technical_score === null ||
    result.hard_filter_failures.length === 0 && result.missing_keywords.length === 0 && result.matched_keywords.length === 0 ||
    result.evidence_notes.length === 0 ||
    result.risk_flags.length === 0 ||
    result.technical_questions.length === 0 ||
    result.behavioral_questions.length === 0 ||
    result.mock_interview.length === 0 ||
    result.confidence_score === null ||
    !result.final_verdict
  ) {
    throw new Error('Gemini response was incomplete.');
  }

  return result;
}

app.post('/analyzeResume', async (req, res) => {
  const { resume, job } = req.body || {};

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Missing GEMINI_API_KEY in environment.' });
  }

  if (typeof resume !== 'string' || !resume.trim()) {
    return res.status(400).json({ error: 'Please provide resume text.' });
  }

  if (typeof job !== 'string' || !job.trim()) {
    return res.status(400).json({ error: 'Please provide a job description.' });
  }

  try {
    const result = await analyzeWithGemini(resume.trim(), job.trim());
    return res.json(result);
  } catch (error) {
    const details = getErrorDetails(error);
    console.error('Resume text analysis failed:', error);
    return res.status(500).json({ error: 'Failed to analyze resume', details });
  }
});

app.post('/uploadResumeAndAnalyze', upload.single('resumeFile'), async (req, res) => {
  const { job } = req.body || {};

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Missing GEMINI_API_KEY in environment.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a resume file.' });
  }

  if (typeof job !== 'string' || !job.trim()) {
    return res.status(400).json({ error: 'Please provide a job description.' });
  }

  try {
    const resumeText = await extractResumeText(req.file);

    if (!resumeText) {
      return res.status(400).json({ error: 'Could not extract readable text from the uploaded file.' });
    }

    const result = await analyzeWithGemini(resumeText, job.trim());
    return res.json(result);
  } catch (error) {
    const details = getErrorDetails(error);
    console.error('Resume upload analysis failed:', error);
    return res.status(500).json({ error: 'Failed to analyze resume', details });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Resume file is too large. Maximum size is 5MB.' });
    }

    return res.status(400).json({ error: error.message || 'Upload failed.' });
  }

  if (error) {
    console.error('Unhandled server error:', error);
    return res.status(400).json({ error: error.message || 'Request failed.' });
  }

  return next();
});

app.listen(PORT, HOST, () => {
  console.log(`InterviewIQ running at http://${HOST}:${PORT}`);
});

async function callGeminiWithRetry(payload, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.post(
        `${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000
        }
      );

      return response;
    } catch (err) {
      const isLast = i === retries - 1;

      // exponential backoff
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));

      if (isLast) throw err;
    }
  }
}