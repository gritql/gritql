import { ExtensionRegistry } from '../../plugins/registry';
import { Extension } from '../../types';

describe('ExtensionRegistry', () => {
  let registry: ExtensionRegistry;

  beforeEach(() => {
    registry = new ExtensionRegistry();
  });

  it('should create registry instance', () => {
    expect(registry).toBeDefined();
  });

  it('should register basic extension', () => {
    const extension: Extension = {
      name: 'test-extension',
    };

    registry.register(extension);
    const extensions = registry.getExtensions();
    
    expect(extensions).toHaveLength(1);
    expect(extensions[0].name).toBe('test-extension');
  });

  it('should register metric parser', () => {
    const extension: Extension = {
      name: 'test-extension',
      metricParsers: [{
        name: 'count',
        parse: jest.fn(),
      }],
    };

    registry.register(extension);
    const parser = registry.getMetricParser('count');
    
    expect(parser).toBeDefined();
    expect(parser?.name).toBe('count');
  });
});