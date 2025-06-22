import { query } from '../../intent';

describe('Intent QueryBuilder', () => {
  it('should create builder instance', () => {
    const builder = query();
    expect(builder).toBeDefined();
    expect(builder.getSteps()).toHaveLength(0);
  });

  it('should build select query', () => {
    const builder = query()
      .from('users')
      .select('name')
      .select('email', 'user_email');
    
    const steps = builder.getSteps();
    expect(steps).toHaveLength(3); // from + 2 selects
    expect(steps[0]).toEqual({ type: 'from', args: ['users'] });
    expect(steps[1]).toEqual({ type: 'select', args: ['name'] });
    expect(steps[2]).toEqual({ type: 'select', args: ['email', 'user_email'] });
  });

  it('should build count query', () => {
    const builder = query()
      .from('users')
      .count('*', 'total');
    
    const steps = builder.getSteps();
    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual({ type: 'from', args: ['users'] });
    expect(steps[1]).toEqual({ type: 'count', args: ['*', 'total'] });
  });

  it('should build where conditions', () => {
    const builder = query()
      .from('users')
      .where('age', '>', 18)
      .where('status', '=', 'active');
    
    const steps = builder.getSteps();
    expect(steps).toHaveLength(3); // from + 2 wheres
    expect(steps[0]).toEqual({ type: 'from', args: ['users'] });
    expect(steps[1]).toEqual({ type: 'where', args: ['age', '>', 18] });
    expect(steps[2]).toEqual({ type: 'where', args: ['status', '=', 'active'] });
  });

  it('should build group by and order by', () => {
    const builder = query()
      .from('users')
      .groupBy('department')
      .orderBy('created_at', 'desc');
    
    const steps = builder.getSteps();
    expect(steps[0]).toEqual({ type: 'from', args: ['users'] });
    expect(steps[1]).toEqual({ type: 'groupBy', args: ['department'] });
    expect(steps[2]).toEqual({ type: 'orderBy', args: ['created_at', 'desc'] });
  });

  it('should build pagination', () => {
    const builder = query()
      .from('users')
      .limit(20)
      .offset(40);
    
    const steps = builder.getSteps();
    expect(steps[0]).toEqual({ type: 'from', args: ['users'] });
    expect(steps[1]).toEqual({ type: 'limit', args: [20] });
    expect(steps[2]).toEqual({ type: 'offset', args: [40] });
  });

  it('should remove steps by index', () => {
    const builder = query()
      .from('users')
      .select('name')
      .where('active', '=', true);
    
    const newBuilder = builder.remove(2); // Remove where clause
    
    expect(newBuilder.getSteps()).toHaveLength(2); // from and select
    expect(newBuilder.getSteps()[0]).toEqual({ type: 'from', args: ['users'] });
    expect(newBuilder.getSteps()[1]).toEqual({ type: 'select', args: ['name'] });
  });

  it('should name steps', () => {
    const builder = query()
      .from('users')
      .select('name')
      .name('selectName')
      .where('active', '=', true);
    
    const steps = builder.getSteps();
    expect(steps[1].name).toBe('selectName');
  });

  it('should support step grouping', () => {
    const builder = query()
      .from('users')
      .select('name')
      .startGroup()
      .where('age', '>', 18)
      .where('status', '=', 'active')
      .endGroup();
    
    const steps = builder.getSteps();
    expect(steps).toHaveLength(3); // from, select, group
    expect(steps[0]).toEqual({ type: 'from', args: ['users'] });
    expect(steps[1]).toEqual({ type: 'select', args: ['name'] });
    expect(steps[2].type).toBe('__GROUP');
    expect(steps[2].steps).toHaveLength(2); // two where conditions
    expect(steps[2].steps[0]).toEqual({ type: 'where', args: ['age', '>', 18] });
    expect(steps[2].steps[1]).toEqual({ type: 'where', args: ['status', '=', 'active'] });
  });
});