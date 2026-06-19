import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

describe('App shell', () => {
  it('renders the primary navigation', () => {
    render(
      <MemoryRouter initialEntries={['/resume/scan']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /scanner/i })).toBeInTheDocument();
  });

  it('renders the scanner page on the default route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /resume scanner/i })).toBeInTheDocument();
  });
});
