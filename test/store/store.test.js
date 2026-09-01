import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createDebouncedWriter, STATUS } from '../../src/store/store.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const makeStore = (seed) => {
  const driver = createMemoryDriver({ seed });
  return { driver, store: createStore({ driver }) };
};

test('a fresh store reads null rather than throwing', async () => {
  const { store } = makeStore();
  assert.equal(await store.open(), STATUS.READY);
  assert.equal(await store.read(), null);
});

test('what is written is what is read back', async () => {
  const { store } = makeStore();
  await store.open();
  await store.write({ hello: 'world', n: 1 });
  assert.deepEqual(await store.read(), { hello: 'world', n: 1 });
});

test('a corrupt primary reports rather than returning an empty document', async () => {
  const { store } = makeStore({ 'state.json': '{ not json' });
  await store.open();
  await assert.rejects(() => store.read());
  assert.equal(store.status, STATUS.ERROR);
});

test('a driver fault surfaces as an error status, not a crash', async () => {
  const { driver, store } = makeStore();
  await store.open();
  driver.setFault((op) => (op === 'putText' ? new Error('disk full') : null));
  await assert.rejects(() => store.write({ a: 1 }));
});

test('the debounced writer coalesces a burst into one write', async () => {
  const { driver, store } = makeStore();
  await store.open();
  const writer = createDebouncedWriter(store, { idle: 20, ceiling: 200 });

  let writes = 0;
  const realPut = driver.putText.bind(driver);
  driver.putText = async (name, text) => { if (name === 'state.json') writes++; return realPut(name, text); };

  for (let i = 0; i < 10; i++) writer.schedule({ n: i });
  await writer.flush();

  assert.equal(writes, 1, 'ten edits in one burst must cost one write');
  assert.deepEqual(await store.read(), { n: 9 }, 'and the last edit must win');
});

test('flush resolves only once the write has actually landed', async () => {
  // This is the page-unload path. A flush() that resolved while a write was
  // still in flight would lose the last edit — a real bug the reference app's
  // suite caught, and the reason this test exists.
  const { store } = makeStore();
  await store.open();
  const writer = createDebouncedWriter(store, { idle: 5, ceiling: 50 });
  writer.schedule({ final: true });
  await writer.flush();
  assert.deepEqual(await store.read(), { final: true });
});
