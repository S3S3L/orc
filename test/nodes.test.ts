import { BashNode } from '../src/nodes/BashNode.js';
import { PythonNode } from '../src/nodes/PythonNode.js';
import { NodeNode } from '../src/nodes/NodeNode.js';
import type { ExecutionContext } from '../src/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

async function runTests() {
  const testDir = path.join(process.cwd(), 'test', 'temp');
  await fs.mkdir(testDir, { recursive: true });

  // Bash 测试脚本
  const bashScript = path.join(testDir, 'echo.sh');
  await fs.writeFile(bashScript, `#!/bin/bash
input=$(cat)
echo "{\\\"received\\\": $input, \\\"source\\\": \\\"bash\\\"}"
`);
  await fs.chmod(bashScript, 0o755);

  // Python 测试脚本
  const pythonScript = path.join(testDir, 'echo.py');
  await fs.writeFile(pythonScript, `#!/usr/bin/env python3
import json
import sys
input_data = json.load(sys.stdin)
print(json.dumps({"received": input_data, "source": "python"}))
`);
  await fs.chmod(pythonScript, 0o755);

  // Node 测试脚本
  const nodeScript = path.join(testDir, 'echo.js');
  await fs.writeFile(nodeScript, `
const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
console.log(JSON.stringify({ received: input, source: 'node' }));
`);

  console.log('Test 1: Bash node execution...');
  try {
    const context1: ExecutionContext = {
      workflowDir: process.cwd(),
      outputDir: path.join(testDir, 'output1'),
      auditDir: path.join(testDir, 'audit1'),
      tempBaseDir: path.join(testDir, 'temp1'),
      sessionId: 'test-1',
      nodeOutputs: new Map(),
      auditLog: []
    };

    await fs.mkdir(context1.tempBaseDir, { recursive: true });

    const bashNode = new BashNode();
    const result = await bashNode.execute(
      {
        id: 'bash-node',
        type: 'bash',
        name: 'Bash Node',
        inputs: { data: { type: 'object' } },
        output: { type: 'object' },
        config: {
          script: bashScript,
          argsPassing: { type: 'stdin' },
          timeout: 30000
        }
      },
      { data: { test: 'input' } },
      context1
    );
    console.log('✓ Bash node executed:', JSON.stringify(result));
  } catch (e) {
    console.error('✗ Bash node failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  }

  console.log('\nTest 2: Python node execution...');
  try {
    const pythonNode = new PythonNode();
    const context2: ExecutionContext = {
      workflowDir: process.cwd(),
      outputDir: path.join(testDir, 'output2'),
      auditDir: path.join(testDir, 'audit2'),
      tempBaseDir: path.join(testDir, 'temp2'),
      sessionId: 'test-2',
      nodeOutputs: new Map(),
      auditLog: []
    };

    await fs.mkdir(context2.tempBaseDir, { recursive: true });

    const result = await pythonNode.execute(
      {
        id: 'python-node',
        type: 'python',
        name: 'Python Node',
        inputs: { data: { type: 'object' } },
        output: { type: 'object' },
        config: {
          script: pythonScript,
          argsPassing: { type: 'stdin' },
          timeout: 30000
        }
      },
      { data: { test: 'input' } },
      context2
    );
    console.log('✓ Python node executed:', JSON.stringify(result));
  } catch (e) {
    console.error('✗ Python node failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  }

  console.log('\nTest 3: Node node execution...');
  try {
    const nodeNode = new NodeNode();
    const context3: ExecutionContext = {
      workflowDir: process.cwd(),
      outputDir: path.join(testDir, 'output3'),
      auditDir: path.join(testDir, 'audit3'),
      tempBaseDir: path.join(testDir, 'temp3'),
      sessionId: 'test-3',
      nodeOutputs: new Map(),
      auditLog: []
    };

    await fs.mkdir(context3.tempBaseDir, { recursive: true });

    const result = await nodeNode.execute(
      {
        id: 'node-node',
        type: 'node',
        name: 'Node Node',
        inputs: { data: { type: 'object' } },
        output: { type: 'object' },
        config: {
          script: nodeScript,
          argsPassing: { type: 'stdin' },
          timeout: 30000
        }
      },
      { data: { test: 'input' } },
      context3
    );
    console.log('✓ Node node executed:', JSON.stringify(result));
  } catch (e) {
    console.error('✗ Node node failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  }

  console.log('\n✓ All node execution tests passed!');
}

runTests();
