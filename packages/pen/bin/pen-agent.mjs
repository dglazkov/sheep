#!/usr/bin/env node
// The process the image runs. Node 24 strips the types from `src/*.ts` on
// import, so the agent needs no build step and no dependencies.
import { main } from "../src/node.ts";

process.exitCode = await main();
