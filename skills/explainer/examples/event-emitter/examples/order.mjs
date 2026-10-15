import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
emitter.on('ready', () => {
  console.log('listener');
  queueMicrotask(() => console.log('microtask'));
});

console.log('before');
console.log(`handled: ${emitter.emit('ready')}`);
console.log('after');
