// Worker that parses bytes with opentype.js directly, skipping inspectFont's format check.
import { parentPort, workerData } from "node:worker_threads";
import { parseFont } from "../../../src/core/typography/opentypeFont.ts";

parseFont(workerData as ArrayBuffer);
parentPort?.postMessage({ ok: true, name: "parsed", format: "ttf" });
