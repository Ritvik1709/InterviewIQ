const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function extractTextFromGemini(responseData) {
  const parts = responseData &&
    responseData.candidates &&
    responseData.candidates[0] &&
    responseData.candidates[0].content &&
    responseData.candidates[0].content.parts;

  if (!Array.isArray(parts) || parts.length === 0) {
    return '';
  }

  return parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

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
  const resumeFeedback = Array.isArray(payload.resume_feedback)
    ? payload.resume_feedback.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const interviewQuestions = Array.isArray(payload.interview_questions)
    ? payload.interview_questions.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const suggestedAnswers = Array.isArray(payload.suggested_answers)
    ? payload.suggested_answers.map((item) => {
        if (item && typeof item === 'object') {
          return {
            question: String(item.question || '').trim(),
            answer: String(item.answer || '').trim()
          };
        }

        return {
          question: '',
          answer: String(item || '').trim()
        };
      }).filter((item) => item.question || item.answer)
    : [];
  const skillGaps = Array.isArray(payload.skill_gaps)
    ? payload.skill_gaps.map((item) => String(item).trim()).filter(Boolean)
    : [];

  return {
    ats_score: Number.isFinite(atsScore) ? Math.max(0, Math.min(100, Math.round(atsScore))) : null,
    resume_feedback: resumeFeedback,
    optimized_resume: typeof payload.optimized_resume === 'string' ? payload.optimized_resume.trim() : '',
    interview_questions: interviewQuestions,
    suggested_answers: suggestedAnswers,
    skill_gaps: skillGaps
  };
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
    return res.status(400).json({ error: 'Please provide a job description or job posting text.' });
  }

  const prompt = [
    'You are an expert recruiter. Compare resume vs job description and return structured JSON only.',
    '',
    'Return valid JSON only with this exact shape:',
    '',
    '{',
    '  "ats_score": 0,',
    '  "resume_feedback": ["bullet 1", "bullet 2"],',
    '  "optimized_resume": "tailored resume rewrite",',
    '  "interview_questions": ["question 1", "question 2"],',
    '  "suggested_answers": [',
    '    {',
    '      "question": "question 1",',
    '      "answer": "concise answer 1"',
    '    }',
    '  ],',
    '  "skill_gaps": ["gap 1", "gap 2"]',
    '}',
    '',
    'Requirements:',
    '- ATS score must be an integer from 0 to 100.',
    '- Resume feedback should be a practical bullet list of improvements.',
    '- Optimized resume should be tailored to the job while staying believable.',
    '- Provide 10 to 15 likely interview questions.',
    '- Suggested answers should be structured, concise, and aligned to the resume/job.',
    '- Skill gaps should highlight what the candidate should fix before the interview.',
    '',
    'Resume:',
    resume.trim(),
    '',
    'Job description:',
    job.trim()
  ].join('\n');

  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.9,
          responseMimeType: 'application/json'
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('Gemini returned no candidate text.');
    }

    let parsed;
    try {
      parsed = safeJsonParse(rawText);
    } catch (parseError) {
      throw new Error('Gemini returned invalid JSON.');
    }

    const result = normalizeOutput(parsed);
    if (
      result.ats_score === null ||
      result.resume_feedback.length === 0 ||
      !result.optimized_resume ||
      result.interview_questions.length === 0 ||
      result.suggested_answers.length === 0 ||
      result.skill_gaps.length === 0
    ) {
      return res.status(502).json({ error: 'Gemini response was incomplete.' });
    }

    return res.json(result);
  } catch (error) {
    const details = getErrorDetails(error);
    console.error('Resume analysis failed:', error);

    return res.status(500).json({ error: 'Failed to analyze resume', details });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`InterviewIQ running at http://${HOST}:${PORT}`);
});
