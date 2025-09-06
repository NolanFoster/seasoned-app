import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useForm } from '../hooks/useForm';

describe('useForm Hook', () => {
  it('should initialize with default values', () => {
    const initialValues = { name: 'Test', email: 'test@example.com' };
    const { result } = renderHook(() => useForm(initialValues));

    expect(result.current.values).toEqual(initialValues);
    expect(result.current.errors).toEqual({});
    expect(result.current.isValid).toBe(true);
    expect(result.current.isDirty).toBe(false);
  });

  it('should update field values', () => {
    const { result } = renderHook(() => useForm({ name: '' }));

    act(() => {
      result.current.setFieldValue('name', 'New Name');
    });

    expect(result.current.values.name).toBe('New Name');
    expect(result.current.isDirty).toBe(true);
  });

  it('should validate required fields', () => {
    const validationSchema = {
      name: [{ type: 'required', message: 'Name is required' }]
    };
    
    const { result } = renderHook(() => useForm({ name: '' }, validationSchema));

    act(() => {
      result.current.setFieldValue('name', '');
    });

    expect(result.current.errors.name).toBe('Name is required');
    expect(result.current.isValid).toBe(false);
  });

  it('should validate email format', () => {
    const validationSchema = {
      email: [{ type: 'email', message: 'Invalid email format' }]
    };
    
    const { result } = renderHook(() => useForm({ email: '' }, validationSchema));

    act(() => {
      result.current.setFieldValue('email', 'invalid-email');
    });

    expect(result.current.errors.email).toBe('Invalid email format');
    expect(result.current.isValid).toBe(false);
  });

  it('should clear errors when field becomes valid', () => {
    const validationSchema = {
      name: [{ type: 'required', message: 'Name is required' }]
    };
    
    const { result } = renderHook(() => useForm({ name: '' }, validationSchema));

    // Set invalid value
    act(() => {
      result.current.setFieldValue('name', '');
    });

    expect(result.current.errors.name).toBe('Name is required');

    // Set valid value
    act(() => {
      result.current.setFieldValue('name', 'Valid Name');
    });

    expect(result.current.errors.name).toBeUndefined();
    expect(result.current.isValid).toBe(true);
  });

  it('should handle form submission', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    const { result } = renderHook(() => useForm({ name: 'Test' }));

    await act(async () => {
      await result.current.handleSubmit(onSubmit)({ preventDefault: vi.fn() });
    });

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Test' });
  });

  it('should reset form to initial values', () => {
    const initialValues = { name: 'Initial' };
    const { result } = renderHook(() => useForm(initialValues));

    // Change values
    act(() => {
      result.current.setFieldValue('name', 'Changed');
    });

    expect(result.current.values.name).toBe('Changed');
    expect(result.current.isDirty).toBe(true);

    // Reset form
    act(() => {
      result.current.resetForm();
    });

    expect(result.current.values).toEqual(initialValues);
    expect(result.current.isDirty).toBe(false);
  });

  it('should get field props for input components', () => {
    const { result } = renderHook(() => useForm({ name: 'Test' }));

    const fieldProps = result.current.getFieldProps('name');

    expect(fieldProps.value).toBe('Test');
    expect(typeof fieldProps.onChange).toBe('function');
    expect(typeof fieldProps.onBlur).toBe('function');
    expect(fieldProps.error).toBeNull();
    expect(fieldProps.hasError).toBe(false);
  });
});
