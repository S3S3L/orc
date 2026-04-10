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

  // 尝试 1: 直接执行
  console.log('\n=== Test 1: Direct execution ===');
  const result1 = await execa('bash', [scriptPath], {
    cwd: tempDir,
    all: true
  });
  console.log('Exit code 1:', result1.exitCode);
  console.log('Stdout 1:', result1.stdout);

  // 尝试 2: 使用 input
  console.log('\n=== Test 2: With input ===');
  const result2 = await execa('bash', [scriptPath], {
    cwd: tempDir,
    input: JSON.stringify({}),
    all: true
  });
  console.log('Exit code 2:', result2.exitCode);
  console.log('Stdout 2:', result2.stdout);

  // 尝试 3: 使用 stdin
  console.log('\n=== Test 3: With stdin ===');
  const result3 = await execa('bash', [scriptPath], {
    cwd: tempDir,
    stdin: 'pipe',
    all: true
  });
  result3.stdin.write(JSON.stringify({}));
  result3.stdin.end();
  console.log('Exit code 3:', result3.exitCode);
  console.log('Stdout 3:', result3.stdout);
}

test();
