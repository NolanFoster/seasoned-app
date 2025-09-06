import { useState, useCallback, useEffect } from 'react';
import { DEFAULT_FORM_STATE, FORM_STATUS, FORM_VALIDATION_RULES } from '../types/index.js';

/**
 * Custom hook for form management
 */
export const useForm = (initialValues = {}, validationSchema = {}) => {
  const [state, setState] = useState({
    ...DEFAULT_FORM_STATE,
    values: { ...initialValues }
  });

  // Validate a single field
  const validateField = useCallback((fieldName, value) => {
    const rules = validationSchema[fieldName];
    if (!rules) return null;

    for (const rule of rules) {
      const { type, message, ...params } = rule;
      const validator = FORM_VALIDATION_RULES[type];
      
      if (validator && !validator(value, ...Object.values(params))) {
        return message;
      }
    }

    return null;
  }, [validationSchema]);

  // Validate all fields
  const validateForm = useCallback(() => {
    const errors = {};
    let isValid = true;

    Object.keys(validationSchema).forEach(fieldName => {
      const error = validateField(fieldName, state.values[fieldName]);
      if (error) {
        errors[fieldName] = error;
        isValid = false;
      }
    });

    return { errors, isValid };
  }, [state.values, validateField, validationSchema]);

  // Update field value
  const setFieldValue = useCallback((fieldName, value) => {
    setState(prev => {
      const newValues = { ...prev.values, [fieldName]: value };
      const error = validateField(fieldName, value);
      const newErrors = { ...prev.errors };
      
      if (error) {
        newErrors[fieldName] = error;
      } else {
        delete newErrors[fieldName];
      }

      const { isValid } = validateForm();

      return {
        ...prev,
        values: newValues,
        errors: newErrors,
        touched: { ...prev.touched, [fieldName]: true },
        isDirty: true,
        isValid
      };
    });
  }, [validateField, validateForm]);

  // Set field touched
  const setFieldTouched = useCallback((fieldName, touched = true) => {
    setState(prev => ({
      ...prev,
      touched: { ...prev.touched, [fieldName]: touched }
    }));
  }, []);

  // Set field error
  const setFieldError = useCallback((fieldName, error) => {
    setState(prev => ({
      ...prev,
      errors: { ...prev.errors, [fieldName]: error }
    }));
  }, []);

  // Clear field error
  const clearFieldError = useCallback((fieldName) => {
    setState(prev => {
      const newErrors = { ...prev.errors };
      delete newErrors[fieldName];
      return { ...prev, errors: newErrors };
    });
  }, []);

  // Set multiple field values
  const setValues = useCallback((values) => {
    setState(prev => ({
      ...prev,
      values: { ...prev.values, ...values },
      isDirty: true
    }));
  }, []);

  // Reset form
  const resetForm = useCallback((newValues = initialValues) => {
    setState({
      ...DEFAULT_FORM_STATE,
      values: { ...newValues }
    });
  }, [initialValues]);

  // Set form status
  const setStatus = useCallback((status) => {
    setState(prev => ({
      ...prev,
      status,
      isSubmitting: status === FORM_STATUS.SUBMITTING
    }));
  }, []);

  // Set form error
  const setError = useCallback((error) => {
    setState(prev => ({
      ...prev,
      status: FORM_STATUS.ERROR,
      error
    }));
  }, []);

  // Clear form error
  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      status: prev.status === FORM_STATUS.ERROR ? FORM_STATUS.IDLE : prev.status,
      error: null
    }));
  }, []);

  // Handle form submission
  const handleSubmit = useCallback((onSubmit) => {
    return async (event) => {
      event.preventDefault();
      
      // Mark all fields as touched
      const touchedFields = {};
      Object.keys(validationSchema).forEach(fieldName => {
        touchedFields[fieldName] = true;
      });
      
      setState(prev => ({
        ...prev,
        touched: { ...prev.touched, ...touchedFields }
      }));

      // Validate form
      const { errors, isValid } = validateForm();
      
      if (!isValid) {
        setState(prev => ({ ...prev, errors }));
        return;
      }

      // Submit form
      try {
        setStatus(FORM_STATUS.SUBMITTING);
        await onSubmit(state.values);
        setStatus(FORM_STATUS.SUCCESS);
      } catch (error) {
        setError(error.message || 'An error occurred');
      }
    };
  }, [state.values, validateForm, setStatus, setError]);

  // Get field props for input components
  const getFieldProps = useCallback((fieldName) => {
    return {
      value: state.values[fieldName] || '',
      onChange: (event) => {
        const value = event.target.type === 'checkbox' 
          ? event.target.checked 
          : event.target.value;
        setFieldValue(fieldName, value);
      },
      onBlur: () => setFieldTouched(fieldName),
      error: state.touched[fieldName] ? state.errors[fieldName] : null,
      hasError: state.touched[fieldName] && !!state.errors[fieldName]
    };
  }, [state.values, state.errors, state.touched, setFieldValue, setFieldTouched]);

  // Validate form on mount and when values change
  useEffect(() => {
    const { isValid } = validateForm();
    setState(prev => ({ ...prev, isValid }));
  }, [state.values, validateForm]);

  return {
    // State
    values: state.values,
    errors: state.errors,
    touched: state.touched,
    status: state.status,
    isSubmitting: state.isSubmitting,
    isValid: state.isValid,
    isDirty: state.isDirty,
    error: state.error,

    // Actions
    setFieldValue,
    setFieldTouched,
    setFieldError,
    clearFieldError,
    setValues,
    resetForm,
    setStatus,
    setError,
    clearError,
    handleSubmit,
    getFieldProps,
    validateField,
    validateForm
  };
};
