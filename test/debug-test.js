#!/usr/bin/env node
const path = require('path');
const fs = require('fs/promises');

const { BashNode } = require(path.join(process.cwd(), 'dist', 'src', 'nodes', 'BashNode.js'));

async function test() {
  const workflowDir = process.cwd();
  const script = path.join(workflowDir, 'examples/scripts/generate-data.sh');

  console.log('Script path:', script);

  // 检查脚本是否存在
  try {
    await fs.access(script);
    console.log('Script exists!');
  } catch (e) {
    console.log('Script does not exist!');
    return;
  }

  const context = {
    workflowDir,
    outputDir: path.join(process.cwd(), 'output'),
    auditDir: path.join(process.cwd(), 'audit'),
    tempBaseDir: path.join(process.cwd(), 'workspace'),
    sessionId: 'test',
    nodeOutputs: new Map(),
    auditLog: []
  };

  await fs.mkdir(context.tempBaseDir, { recursive: true });

  const bashNode = new BashNode();
  try {
    const result = await bashNode.execute(
      {
        id: 'generate-data',
        type: 'bash',
        name: 'Generate Data',
        inputs: {},
        output: { type: 'object' },
        config: {
          script: './examples/scripts/generate-data.sh',
          argsPassing: { type: 'stdin' }
        }
      },
      {},  // 空输入
      context
    );
    console.log('Result:', JSON.stringify(result));
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Stack:', e.stack);
  }
}

test();
