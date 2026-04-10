import { WorkflowGraph } from '../src/core/Graph.js';
import type { WorkflowDefinition } from '../src/types.js';

// 测试 1: 有效的 DAG 工作流
console.log('Test 1: Valid DAG workflow...');
const validWorkflow: WorkflowDefinition = {
  version: '1.0',
  name: 'Test Workflow',
  nodes: [
    {
      id: 'node1',
      type: 'bash',
      name: 'Node 1',
      inputs: {},
      output: { type: 'object' },
      config: {
        script: 'test.sh',
        argsPassing: { type: 'stdin' }
      }
    },
    {
      id: 'node2',
      type: 'bash',
      name: 'Node 2',
      inputs: {
        input1: { type: 'object' }
      },
      output: { type: 'object' },
      config: {
        script: 'test.sh',
        argsPassing: { type: 'stdin' }
      }
    }
  ],
  edges: [
    {
      id: 'edge1',
      from: { nodeId: 'node1' },
      to: { nodeId: 'node2', input: 'input1' }
    }
  ]
};

try {
  const graph1 = new WorkflowGraph(validWorkflow);
  const order1 = graph1.getExecutionOrder();
  console.log('✓ Valid DAG accepted');
  console.log('  Execution order:', order1);
} catch (e) {
  console.error('✗ Valid DAG rejected:', e instanceof Error ? e.message : e);
  process.exit(1);
}

// 测试 2: 检测环
console.log('\nTest 2: Detect cycle...');
const cyclicWorkflow: WorkflowDefinition = {
  version: '1.0',
  name: 'Cyclic Workflow',
  nodes: [
    {
      id: 'nodeA',
      type: 'bash',
      name: 'Node A',
      inputs: { input: { type: 'object' } },
      output: { type: 'object' },
      config: {
        script: 'test.sh',
        argsPassing: { type: 'stdin' }
      }
    },
    {
      id: 'nodeB',
      type: 'bash',
      name: 'Node B',
      inputs: { input: { type: 'object' } },
      output: { type: 'object' },
      config: {
        script: 'test.sh',
        argsPassing: { type: 'stdin' }
      }
    }
  ],
  edges: [
    { id: 'e1', from: { nodeId: 'nodeA' }, to: { nodeId: 'nodeB', input: 'input' } },
    { id: 'e2', from: { nodeId: 'nodeB' }, to: { nodeId: 'nodeA', input: 'input' } }
  ]
};

try {
  const graph2 = new WorkflowGraph(cyclicWorkflow);
  console.error('✗ Cycle not detected');
  process.exit(1);
} catch (e) {
  console.log('✓ Cycle detected:', e instanceof Error ? e.message : e);
}

// 测试 3: 缺失输入检测
console.log('\nTest 3: Missing input detection...');
const missingInputWorkflow: WorkflowDefinition = {
  version: '1.0',
  name: 'Missing Input Workflow',
  nodes: [
    {
      id: 'node1',
      type: 'bash',
      name: 'Node 1',
      inputs: {},
      output: { type: 'object' },
      config: {
        script: 'test.sh',
        argsPassing: { type: 'stdin' }
      }
    },
    {
      id: 'node2',
      type: 'bash',
      name: 'Node 2',
      inputs: {
        requiredInput: { type: 'object' },
        optionalInput: { type: 'object' }
      },
      output: { type: 'object' },
      config: {
        script: 'test.sh',
        argsPassing: { type: 'stdin' }
      }
    }
  ],
  edges: [
    {
      id: 'edge1',
      from: { nodeId: 'node1' },
      to: { nodeId: 'node2', input: 'requiredInput' }
    }
    // optionalInput is missing
  ]
};

try {
  const graph3 = new WorkflowGraph(missingInputWorkflow);
  console.error('✗ Missing input not detected');
  process.exit(1);
} catch (e) {
  console.log('✓ Missing input detected:', e instanceof Error ? e.message : e);
}

console.log('\n✓ All tests passed!');
