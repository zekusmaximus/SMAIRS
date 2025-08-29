/* eslint-env node */
module.exports = {
  overrides: [
    // Test files - more lenient rules
    {
      files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', 'tests/**/*'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': 'warn',
        'no-unused-vars': 'warn'
      }
    },
    // E2E test files - very lenient
    {
      files: ['tests/e2e/**/*'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-implicit-any-catch': 'off'
      }
    },
    // Deployment and build scripts
    {
      files: ['scripts/**/*', '*.config.{js,ts}'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-require-imports': 'warn',
        '@typescript-eslint/no-unused-vars': 'warn'
      },
      env: {
        node: true
      }
    }
  ]
};
