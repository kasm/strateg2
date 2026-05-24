#!/usr/bin/env node
// replay MCP server — analyze, verify, and diff strateg2 replay JSON files.
// Tool handlers live in handlers.mjs (pure functions). This file only wires
// them into the MCP SDK transport. See handlers.mjs for safety invariants.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { HANDLERS, TOOL_SPECS } from './handlers.mjs';

async function selftest() {
  // Selftest can't reference a real replay without a fixture, so just verify
  // the handlers load and reject bad input clearly.
  try {
    await HANDLERS['replay.verify']({ path: 'no-such-file.json' });
    throw new Error('expected verify to throw for missing file');
  } catch (e) {
    if (!/ENOENT|no such/.test(e.message)) throw e;
  }
  await HANDLERS['replay.verify']({ path: 'definitely-not-here.json' }).catch(() => {});
  process.stdout.write('OK replay selftest — handlers load, validation rejects missing files\n');
}

if (process.argv.includes('--selftest')) {
  selftest().catch((e) => {
    process.stderr.write(`selftest failed: ${e.stack || e.message}\n`);
    process.exit(1);
  });
} else {
  const server = new Server(
    { name: 'replay', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_SPECS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    const handler = HANDLERS[name];
    if (!handler) {
      return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
    }
    try {
      const result = await handler(args);
      const text = typeof result === 'string'
        ? result
        : (result.markdown != null ? result.markdown : JSON.stringify(result));
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
