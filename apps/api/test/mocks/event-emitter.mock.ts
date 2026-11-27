export class EventEmitter2 {
  emit = jest.fn();
  on = jest.fn();
  once = jest.fn();
  off = jest.fn();
}

export const OnEvent = (_event?: string | string[], _options?: any) => {
  return (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    return descriptor;
  };
};

export class EventEmitterModule {
  static forRoot = jest.fn().mockReturnValue({ module: EventEmitterModule });
}
