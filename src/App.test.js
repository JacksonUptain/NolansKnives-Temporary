import { render, screen } from '@testing-library/react';

test('smoke test - test harness working', () => {
  render(<div>Nolan's Knives</div>);
  expect(screen.getByText(/Nolan/i)).toBeInTheDocument();
});
