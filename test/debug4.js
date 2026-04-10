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

  // 模拟 BashNode 的逻辑
  const inputs = {};
  const stdinData = JSON.stringify(inputs);

  console.log('Running execa with input:', stdinData);

  const result = await execa('bash', [scriptPath], {
    cwd: tempDir,
    env: {},
    input: stdinData,
    timeout: 300000,
    all: true,
    reject: false
  });

  console.log('Full result:', JSON.stringify(result, null, 2));
}

test();
