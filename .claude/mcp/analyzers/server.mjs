#!/usr/bin/env node
// analyzers MCP server — wraps the read-only static-analysis scripts under
// .claude/scripts/ as typed MCP tools. Registered in .mcp.json.
//
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
  // Run a quick handler that always has output.
  const r = await HANDLERS['analyze.structure']({});
  if (!r.markdown || r.markdown.length === 0) {
    throw new Error('analyze.structure returned empty output');
  }
  process.stdout.write(`OK analyzers selftest — analyze.structure produced ${r.markdown.length} chars\n`);
}

if (process.argv.includes('--selftest')) {
  selftest().catch((e) => {
    process.stderr.write(`selftest failed: ${e.stack || e.message}\n`);
    process.exit(1);
  });
} else {
  const server = new Server(
    { name: 'analyzers', version: '0.1.0' },
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
      return { content: [{ type: 'text', text: result.markdown }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
