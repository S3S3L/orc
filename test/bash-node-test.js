#!/usr/bin/env node
const path = require('path');
const fs = require('fs/promises');

// 使用绝对路径
const { BashNode } = require(path.join(process.cwd(), 'dist', 'nodes', 'BashNode.js'));

async function test() {
  const testDir = path.join(process.cwd(), 'test', 'temp');
  await fs.mkdir(testDir, { recursive: true });

  const bashScript = path.join(testDir, 'echo3.sh');
  await fs.writeFile(bashScript, `#!/bin/bash
input=$(cat)
echo "{\\\"received\\\": $input, \\\"source\\\": \\\"bash\\\"}"
`);
  await fs.chmod(bashScript, 0o755);

  console.log('Testing BashNode with script:', bashScript);

  const context = {
    workflowDir: process.cwd(),
    outputDir: path.join(testDir, 'output'),
    auditDir: path.join(testDir, 'audit'),
    tempBaseDir: path.join(testDir, 'temp'),
    sessionId: 'test',
    nodeOutputs: new Map(),
    auditLog: []
  };

  await fs.mkdir(context.tempBaseDir, { recursive: true });

  const bashNode = new BashNode();
  try {
    const result = await bashNode.execute(
      {
        id: 'test-node',
        type: 'bash',
        name: 'Test Node',
        inputs: { data: { type: 'object' } },
        output: { type: 'object' },
        config: {
          script: bashScript,
          argsPassing: { type: 'stdin' }
        }
      },
      { data: { test: 'input' } },
      context
    );
    console.log('✓ BashNode executed:', JSON.stringify(result));
  } catch (e) {
    console.error('✗ BashNode failed:', e.message);
  }
}

test();
