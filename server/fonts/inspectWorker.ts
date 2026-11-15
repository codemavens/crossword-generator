// Worker entry: inspects the font bytes in workerData and posts the FontInspection back.
import { parentPort, workerData } from "node:worker_threads";
import { inspectFont } from "../../src/core/typography/inspectFont.ts";

parentPort?.postMessage(inspectFont(workerData as ArrayBuffer));
