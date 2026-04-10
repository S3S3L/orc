#!/usr/bin/env node
const { execa } = require('execa');
const fs = require('fs/promises');
const path = require('path');

async function test() {
  const testDir = path.join(process.cwd(), 'test', 'temp');
  await fs.mkdir(testDir, { recursive: true });

  const bashScript = path.join(testDir, 'echo2.sh');
  await fs.writeFile(bashScript, `#!/bin/bash
input=$(cat)
echo "{\\\"received\\\": $input, \\\"source\\\": \\\"bash\\\"}"
`);
  await fs.chmod(bashScript, 0o755);

  console.log('Testing execa with stdin...');
  const result = await execa('bash', [bashScript], {
    cwd: testDir,
    input: JSON.stringify({ test: 'input' }),
    all: true,
    reject: false
  });

  console.log('Exit code:', result.exitCode);
  console.log('Stdout:', result.stdout);
  console.log('Stderr:', result.stderr);
  console.log('All:', result.all);

  if (result.exitCode === 0) {
    console.log('✓ Test passed!');
  } else {
    console.log('✗ Test failed!');
  }
}

test();
