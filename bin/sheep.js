#!/usr/bin/env node
import { main } from "../dist/sheep.mjs";

process.exitCode = await main(process.argv.slice(2));
