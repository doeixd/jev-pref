#!/usr/bin/env node
// jev-pref CLI entry. Keep this file trivial so `npx jev-pref` starts fast;
// all logic lives in ../src (imported lazily per command where it matters).
import { run } from "../src/cli.js";

const code = await run(process.argv.slice(2));
process.exitCode = code;
