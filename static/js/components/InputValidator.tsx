import React from 'react';

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: string) => string | null;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export const validateInput = (value: string, rules: ValidationRule): ValidationResult => {
  const errors: string[] = [];

  if (rules.required && (!value || value.trim().length === 0)) {
    errors.push('This field is required');
  }

  if (value && rules.minLength && value.length < rules.minLength) {
    errors.push(`Minimum length is ${rules.minLength} characters`);
  }

  if (value && rules.maxLength && value.length > rules.maxLength) {
    errors.push(`Maximum length is ${rules.maxLength} characters`);
  }

  if (value && rules.pattern && !rules.pattern.test(value)) {
    errors.push('Invalid format');
  }

  if (value && rules.custom) {
    const customError = rules.custom(value);
    if (customError) {
      errors.push(customError);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Common validation rules
export const validationRules = {
  solanaAddress: {
    required: true,
    minLength: 44,
    maxLength: 44,
    pattern: /^[1-9A-HJ-NP-Za-km-z]{44}$/,
    custom: (value: string) => {
      try {
        // Basic Solana address format validation
        if (!/^[1-9A-HJ-NP-Za-km-z]{44}$/.test(value)) {
          return 'Invalid Solana address format';
        }
        return null;
      } catch {
        return 'Invalid Solana address';
      }
    }
  },
  
  signature: {
    required: true,
    minLength: 88,
    maxLength: 88,
    pattern: /^[1-9A-HJ-NP-Za-km-z]{88}$/
  },

  amount: {
    required: true,
    custom: (value: string) => {
      const num = parseFloat(value);
      if (isNaN(num)) return 'Must be a valid number';
      if (num <= 0) return 'Must be greater than 0';
      if (num > 1000000) return 'Amount too large';
      return null;
    }
  }
};

interface ValidatedInputProps {
  type?: string;
  value: string;
  onChange: (value: string) => void;
  rules: ValidationRule;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const ValidatedInput: React.FC<ValidatedInputProps> = ({
  type = 'text',
  value,
  onChange,
  rules,
  placeholder,
  disabled,
  className
}) => {
  const validation = validateInput(value, rules);
  
  return (
    <div className={className}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: `1px solid ${validation.isValid ? '#ddd' : '#ff4444'}`,
          borderRadius: '4px',
          fontSize: '14px'
        }}
      />
      {!validation.isValid && validation.errors.length > 0 && (
        <div style={{
          marginTop: '4px',
          fontSize: '12px',
          color: '#ff4444'
        }}>
          {validation.errors.map((error, index) => (
            <div key={index}>{error}</div>
          ))}
        </div>
      )}
    </div>
  );
};