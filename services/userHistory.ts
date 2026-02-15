import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const USER_DATA_DIR = path.join(__dirname, '..', 'user-data');

export interface UserSession {
  userId: string;
  symptoms: string;
  diagnosis: string;
  healthHistory?: string;
  timestamp: string;
}

// Initialize user data directory
export async function initializeUserDataDir() {
  try {
    await fs.mkdir(USER_DATA_DIR, { recursive: true });
    console.log('User data directory initialized');
  } catch (error) {
    console.error("Failed to create user data directory:", error);
  }
}

// Load or create user's markdown file
export async function loadUserHistory(userId: string): Promise<string> {
  const filePath = path.join(USER_DATA_DIR, `${userId}.md`);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    // File doesn't exist, create new one
    const initialContent = `# Medical History - User ${userId}

**Created:** ${new Date().toISOString()}

---

## Session History

`;
    await fs.writeFile(filePath, initialContent, 'utf-8');
    return initialContent;
  }
}

// Extract only user-provided information (symptoms and health history) from markdown
// This excludes LLM diagnoses to prevent hallucination feedback loops
export function extractUserProvidedHistory(markdownContent: string): string {
  const lines = markdownContent.split('\n');
  const userProvidedSections: string[] = [];
  let currentSession: string[] = [];
  let inSymptomsSection = false;
  let inHealthContextSection = false;
  let inDiagnosisSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect session start
    if (line.match(/^### Session/)) {
      // Save previous session if it exists and has content
      if (currentSession.length > 0) {
        userProvidedSections.push(currentSession.join('\n'));
      }
      // Start new session
      currentSession = [line];
      inSymptomsSection = false;
      inHealthContextSection = false;
      inDiagnosisSection = false;
      continue;
    }
    
    // Detect sections - check for exact matches to avoid false positives
    if (line.includes('**Symptoms Reported:**')) {
      inSymptomsSection = true;
      inHealthContextSection = false;
      inDiagnosisSection = false;
      currentSession.push(line);
      continue;
    }
    
    if (line.includes('**Additional Health Context:**')) {
      inSymptomsSection = false;
      inHealthContextSection = true;
      inDiagnosisSection = false;
      currentSession.push(line);
      continue;
    }
    
    if (line.includes('**Diagnosis & Recommendations:**')) {
      // Stop including content once we hit diagnosis section
      inSymptomsSection = false;
      inHealthContextSection = false;
      inDiagnosisSection = true;
      // Don't include this line or anything after it in this section
      continue;
    }
    
    // If we hit a session separator, finalize current session
    if (line.trim() === '---') {
      // Only add separator if we're not in diagnosis section
      if (!inDiagnosisSection && currentSession.length > 0) {
        // Don't add separator here, it will be added between sessions
      }
      // Reset flags for potential next session
      inSymptomsSection = false;
      inHealthContextSection = false;
      inDiagnosisSection = false;
      continue;
    }
    
    // Only include lines from symptoms or health context sections
    // Skip empty lines if we're not in a valid section
    if (inSymptomsSection || inHealthContextSection) {
      currentSession.push(line);
    }
  }
  
  // Add last session if it exists and doesn't end in diagnosis section
  if (currentSession.length > 0 && !inDiagnosisSection) {
    userProvidedSections.push(currentSession.join('\n'));
  }
  
  // Reconstruct the markdown with only user-provided info
  const headerMatch = markdownContent.match(/^# Medical History[^\n]*\n\n\*\*Created:\*\*[^\n]*/);
  const header = headerMatch ? headerMatch[0] : '';
  
  // If no user-provided sections found, return just the header
  if (userProvidedSections.length === 0) {
    return `${header}

---

## Session History

`;
  }
  
  return `${header}

---

## Session History

${userProvidedSections.join('\n\n---\n\n')}

`;
}

// Append new session to user's markdown file
export async function appendToUserHistory(
  userId: string, 
  symptoms: string, 
  diagnosis: string,
  healthHistory?: string
) {
  const filePath = path.join(USER_DATA_DIR, `${userId}.md`);
  
  const sessionEntry = `
### Session ${new Date().toISOString()}

**Symptoms Reported:**
${symptoms}

${healthHistory ? `**Additional Health Context:**
${healthHistory}
` : ''}

**Diagnosis & Recommendations:**
${diagnosis}

---

`;

  await fs.appendFile(filePath, sessionEntry, 'utf-8');
}

// Generate or validate userId
export function ensureUserId(providedUserId?: string): string {
  return providedUserId || randomUUID();
}