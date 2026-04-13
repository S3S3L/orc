import type { JSONSchema7 } from 'json-schema';

export const WORKFLOW_SCHEMA: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['version', 'name', 'nodes', 'edges'],
  properties: {
    version: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    nodes: {
      type: 'array',
      items: { $ref: '#/definitions/node' }
    },
    edges: {
      type: 'array',
      items: { $ref: '#/definitions/edge' }
    }
  },
  definitions: {
    node: {
      type: 'object',
      required: ['id', 'type', 'inputs', 'output', 'config'],
      properties: {
        id: { type: 'string' },
        type: {
          type: 'string',
          enum: ['bash', 'python', 'node', 'claude-code']
        },
        name: { type: 'string' },
        description: { type: 'string' },
        inputs: {
          type: 'object',
          additionalProperties: {
            $ref: 'http://json-schema.org/draft-07/schema#'
          }
        },
        output: {
          $ref: 'http://json-schema.org/draft-07/schema#'
        },
        config: { type: 'object' }
      }
    },
    edge: {
      type: 'object',
      required: ['id', 'from', 'to'],
      properties: {
        id: { type: 'string' },
        from: {
          type: 'object',
          required: ['nodeId'],
          properties: {
            nodeId: { type: 'string' }
          }
        },
        to: {
          type: 'object',
          required: ['nodeId', 'input'],
          properties: {
            nodeId: { type: 'string' },
            input: { type: 'string' }
          }
        },
        condition: {
          type: 'object',
          properties: {
            branches: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['expression', 'to'],
                properties: {
                  expression: { type: 'string' },
                  to: {
                    type: 'object',
                    required: ['nodeId', 'input'],
                    properties: {
                      nodeId: { type: 'string' },
                      input: { type: 'string' }
                    }
                  }
                }
              }
            },
            onNoMatch: { type: 'string', enum: ['skip', 'skip-node', 'stop', 'error'] }
          }
        }
      }
    }
  }
};
