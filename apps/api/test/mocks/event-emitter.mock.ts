export class EventEmitter2 {
  emit = jest.fn();
  on = jest.fn();
  once = jest.fn();
  off = jest.fn();
}