import { render, screen } from '@testing-library/react';
import React from 'react';
import App from './App';

describe('App', () => {
  it('renders SMAIRS heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /SMAIRS/i })).toBeInTheDocument();
  });
});
