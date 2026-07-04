const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const testCases = require('./config/testCases.json');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 9090;
const TEMP_DIR = path.join(__dirname, 'temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Global flag to check if Docker is active
let dockerAvailable = false;
exec('docker ps', (error) => {
  dockerAvailable = !error;
  console.log(`🐳 Docker status: ${dockerAvailable ? 'AVAILABLE (sandboxed execution)' : 'UNAVAILABLE (falling back to local host compilation)'}`);
});

// Simple in-memory queue to process requests sequentially
const queue = [];
let processing = false;

async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;

  const { req, res } = queue.shift();

  try {
    const result = await evaluateSubmission(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Evaluation failed.' });
  } finally {
    processing = false;
    processQueue();
  }
}

function runCommand(cmd, timeout = 5000) {
  return new Promise((resolve) => {
    exec(cmd, { timeout }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

async function evaluateSubmission({ code, roomOrder }) {
  const submissionId = Date.now() + Math.random().toString(36).substring(2, 7);
  const subDir = path.join(TEMP_DIR, `submission_${submissionId}`);
  fs.mkdirSync(subDir, { recursive: true });

  const solutionPath = path.join(subDir, 'solution.cpp');
  fs.writeFileSync(solutionPath, code);

  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? 'main.exe' : 'main';
  const binaryPath = path.join(subDir, binaryName);

  const targetRoom = testCases[roomOrder.toString()];
  if (!targetRoom) {
    fs.rmSync(subDir, { recursive: true, force: true });
    return { passed: false, notes: `Room ${roomOrder} challenges are not defined in the Judge Server.` };
  }

  // --- Step 0: Text Match Check ---
  if (targetRoom.type === 'text_match') {
    const expectedOutput = targetRoom.cases[0].expected.trim().replace(/\r\n/g, '\n');
    const actualOutput = code.trim().replace(/\r\n/g, '\n');
    const passed = expectedOutput === actualOutput;

    // Cleanup temp files
    try {
      fs.rmSync(subDir, { recursive: true, force: true });
    } catch (err) {}

    if (passed) {
      return { passed: true, notes: `✅ Correct Answer!\n` };
    } else {
      return { passed: false, notes: `❌ Wrong Answer\n   - Expected:\n${expectedOutput}\n   - Got:\n${actualOutput}\n` };
    }
  }

  // --- Step 1: Compilation ---
  let compileCmd;
  let compResult;

  if (dockerAvailable) {
    const mountPath = path.resolve(subDir).replace(/\\/g, '/');
    compileCmd = `docker run --rm -v "${mountPath}:/app" cpp-runner g++ /app/solution.cpp -o /app/main`;
    compResult = await runCommand(compileCmd, 7000);
  } else {
    // Local Host fallback compilation
    compileCmd = `g++ "${solutionPath}" -o "${binaryPath}"`;
    compResult = await runCommand(compileCmd, 5000);
  }

  if (compResult.error) {
    const errorMsg = compResult.stderr || compResult.stdout || 'Compilation failed.';
    fs.rmSync(subDir, { recursive: true, force: true });
    return { passed: false, notes: `Compilation Error:\n${errorMsg}` };
  }

  // --- Step 2: Running Test Cases ---
  let passedAll = true;
  let notes = `Compilation Successful (${dockerAvailable ? 'Docker Sandboxed' : 'Local Host Fallback'}).\n\n`;

  for (let i = 0; i < targetRoom.cases.length; i++) {
    const tc = targetRoom.cases[i];
    const inputPath = path.join(subDir, `input_${i}.txt`);
    const outputPath = path.join(subDir, `output_${i}.txt`);
    fs.writeFileSync(inputPath, tc.input);

    let runCmd;
    let runResult;

    if (dockerAvailable) {
      const mountPath = path.resolve(subDir).replace(/\\/g, '/');
      runCmd = `docker run --rm -v "${mountPath}:/app" cpp-runner sh -c "timeout 3 /app/main < /app/input_${i}.txt > /app/output_${i}.txt"`;
      runResult = await runCommand(runCmd, 5000);
    } else {
      // Local Host fallback execution (timeout logic wrapped)
      if (isWindows) {
        // Windows cmd redirection (timeout handled at Node.js process level)
        runCmd = `"${binaryPath}" < "${inputPath}" > "${outputPath}"`;
        runResult = await runCommand(runCmd, 3000); // 3-second limit
      } else {
        // POSIX timeout command
        runCmd = `timeout 3 "${binaryPath}" < "${inputPath}" > "${outputPath}"`;
        runResult = await runCommand(runCmd, 4000);
      }
    }

    const outExists = fs.existsSync(outputPath);
    const userOutput = outExists ? fs.readFileSync(outputPath, 'utf8') : '';

    const cleanExpected = tc.expected.trim().replace(/\r\n/g, '\n');
    const cleanActual = userOutput.trim().replace(/\r\n/g, '\n');

    // Timeout exit code check (POSIX timeout outputs 124, Node process timeout sets killed property)
    const isTimeout = (runResult.error && runResult.error.code === 124) || (runResult.error && runResult.error.killed);

    if (isTimeout) {
      notes += `❌ Test Case ${i + 1}: Time Limit Exceeded (3000ms limit)\n`;
      passedAll = false;
    } else if (runResult.error) {
      const runErr = runResult.stderr || 'Runtime error.';
      notes += `❌ Test Case ${i + 1}: Runtime Error (${runErr.trim()})\n`;
      passedAll = false;
    } else if (cleanActual !== cleanExpected) {
      notes += `❌ Test Case ${i + 1}: Wrong Answer\n   - Input: ${tc.input.replace(/\n/g, ' ')}\n   - Expected: ${cleanExpected.replace(/\n/g, ' ')}\n   - Got: ${cleanActual.replace(/\n/g, ' ')}\n`;
      passedAll = false;
    } else {
      notes += `✅ Test Case ${i + 1}: Passed\n`;
    }
  }

  // Cleanup temp files
  try {
    fs.rmSync(subDir, { recursive: true, force: true });
  } catch (err) {
    console.error('Failed to cleanup subdirectory:', err);
  }

  return { passed: passedAll, notes };
}

app.post('/judge', (req, res) => {
  const { code, roomOrder } = req.body;
  if (!code || !roomOrder) {
    return res.status(400).json({ success: false, message: 'Missing code or roomOrder in body.' });
  }
  queue.push({ req, res });
  processQueue();
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Judge Server is ready.', docker: dockerAvailable });
});

app.listen(PORT, () => {
  console.log(`🚀 Judge Server running on port ${PORT}`);
});
