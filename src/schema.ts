import type { JSONSchema7 } from 'json-schema';

export const GRAPH_SCHEMA: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['nodes', 'edges'],
  properties: {
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
          enum: ['bash', 'python', 'node', 'claude-code', 'loop']
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
      required: ['id', 'from'],
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
      },
      // An edge must define either `to` or `condition.branches` (at least one)
      anyOf: [
        { required: ['to'] },
        { required: ['condition'] }
      ]
    }
  }
}

export const WORKFLOW_SCHEMA: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: [...(GRAPH_SCHEMA.required || []), 'version', 'name'],
  properties: {
    ...GRAPH_SCHEMA.properties,
    version: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    schemaBaseDir: { type: 'array', items: { type: 'string' } },
    schemas: {
      type: 'object',
      additionalProperties: {
        $ref: '#/definitions/jsonSchema'
      }
    },
  },
  definitions: {
    ...GRAPH_SCHEMA.definitions,
    jsonSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        content: { $ref: 'http://json-schema.org/draft-07/schema#' }
      }
    },
  }
};
