#!/usr/bin/env node
const { execa } = require('execa');
const path = require('path');
const fs = require('fs/promises');

async function test() {
  const script = path.join(process.cwd(), 'examples/scripts/generate-data.sh');
  const tempDir = path.join(process.cwd(), 'workspace');

  await fs.mkdir(tempDir, { recursive: true });

  console.log('Running bash script...');
  const result = await execa('bash', [script], {
    cwd: tempDir,
    input: JSON.stringify({}),
    all: true,
    reject: false
  });

  console.log('Exit code:', result.exitCode);
  console.log('Stdout:', result.stdout);
  console.log('Stderr:', result.stderr);
  console.log('All:', result.all);
  console.log('Result keys:', Object.keys(result));
}

test();
