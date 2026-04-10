#!/usr/bin/env node
const { execa } = require('execa');
const path = require('path');
const fs = require('fs/promises');

async function test() {
  const workflowDir = process.cwd();
  const script = path.join(workflowDir, 'examples/scripts/generate-data.sh');
  const tempDir = path.join(workflowDir, 'workspace');

  await fs.mkdir(tempDir, { recursive: true });

  const scriptPath = path.join(workflowDir, './examples/scripts/generate-data.sh');
  console.log('Script path:', scriptPath);
  console.log('Exists:', await fs.access(scriptPath).then(() => true).catch(() => false));

  const result = await execa('bash', [scriptPath], {
    cwd: tempDir,
    input: JSON.stringify({}),
    all: true,
    reject: false
  });

  console.log('Exit code:', result.exitCode);
  console.log('Stdout:', result.stdout);
  console.log('Stderr:', result.stderr);
  console.log('All:', result.all);
}

test();
