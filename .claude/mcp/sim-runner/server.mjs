#!/usr/bin/env node
// sim-runner MCP server — exposes the strateg2 headless simulation as MCP tools
// over stdio. Registered in .claude/settings.json under `mcpServers`.
//
// Tool handlers live in handlers.mjs (pure functions). This file only wires
// them into the MCP SDK transport. See handlers.mjs for the P7/P8 invariants.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { HANDLERS, TOOL_SPECS, createContext } from './handlers.mjs';

async function selftest() {
  // Drives the same flow as tests/mcp-sim-runner.test.js but in-process. Lets
  // a human verify the server boots and tools work without spinning up a
  // full MCP client.
  const ctx = createContext();
  const { worldId } = await HANDLERS['sim.create']({}, ctx);
  await HANDLERS['sim.spawnInitial']({ worldId }, ctx);
  // Drive both AIs through commands so the sim has work to do.
  await HANDLERS['sim.submit']({ worldId, cmd: { type: 'setOption', playerId: 'red',  key: 'alwaysHit', value: true } }, ctx);
  const { tick } = await HANDLERS['sim.step']({ worldId, ticks: 50 }, ctx);
  const { checksum } = await HANDLERS['sim.checksum']({ worldId }, ctx);
  const snap = await HANDLERS['sim.snapshot']({ worldId, fields: ['tick', 'entitiesCount'] }, ctx);
  await HANDLERS['sim.dispose']({ worldId }, ctx);
  process.stdout.write(
    `OK sim-runner selftest — tick=${tick}, checksum=${checksum}, ` +
    `entitiesCount=${snap.view.entitiesCount}\n`,
  );
}

if (process.argv.includes('--selftest')) {
  selftest().catch((e) => {
    process.stderr.write(`selftest failed: ${e.stack || e.message}\n`);
    process.exit(1);
  });
} else {
  const ctx = createContext();
  const server = new Server(
    { name: 'sim-runner', version: '0.1.0' },
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
      const result = await handler(args, ctx);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
