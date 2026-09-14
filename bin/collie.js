#!/usr/bin/env node
import { main } from "../dist/collie.mjs";

process.exitCode = await main(process.argv.slice(2));
