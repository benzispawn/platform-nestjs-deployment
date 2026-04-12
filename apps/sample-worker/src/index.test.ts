import test from "node:test"
import assert from 'node:assert/strict'
import { processJob } from "./index.js";

test('processJob returns the expected result', () => {
  assert.equal(processJob('example-job'), 'processed:example-job');
});
