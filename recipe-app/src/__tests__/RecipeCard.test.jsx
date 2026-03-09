import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecipeCard from '../RecipeCard';

const baseRecipe = {
  id: 'r1',
  source: 'clipped',
  name: 'Spaghetti Carbonara',
  description: 'A classic Italian pasta dish.',
  image: 'https://example.com/carbonara.jpg',
  prep_time: '10 minutes',
  cook_time: '20 minutes',
  recipe_yield: '4',
  ingredients: ['200g spaghetti', '100g pancetta', '2 eggs'],
  instructions: ['Boil pasta.', 'Fry pancetta.', 'Combine.'],
  source_url: 'https://example.com/carbonara',
};

function renderCard(overrides = {}, props = {}) {
  const recipe = { ...baseRecipe, ...overrides };
  const onClose = jest.fn();
  const onElevate = jest.fn();
  const { rerender } = render(
    <RecipeCard
      recipe={recipe}
      onClose={onClose}
      onElevate={onElevate}
      isElevating={false}
      {...props}
    />
  );
  return { onClose, onElevate, rerender, recipe };
}

describe('RecipeCard — rendering', () => {
  test('renders recipe name', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: /Spaghetti Carbonara/i })).toBeInTheDocument();
  });

  test('renders description', () => {
    renderCard();
    expect(screen.getByText(/classic Italian pasta dish/i)).toBeInTheDocument();
  });

  test('renders prep_time, cook_time and recipe_yield meta', () => {
    renderCard();
    expect(screen.getByText(/10 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/20 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/4/)).toBeInTheDocument();
  });

  test('renders source URL link', () => {
    renderCard();
    const link = screen.getByRole('link', { name: /source/i });
    expect(link).toHaveAttribute('href', 'https://example.com/carbonara');
    expect(link).toHaveAttribute('target', '_blank');
  });

  test('does not render source link when source_url is absent', () => {
    renderCard({ source_url: '' });
    expect(screen.queryByRole('link', { name: /source/i })).not.toBeInTheDocument();
  });

  test('renders image when present', () => {
    renderCard();
    const img = screen.getByRole('img', { name: /Spaghetti Carbonara/i });
    expect(img).toHaveAttribute('src', 'https://example.com/carbonara.jpg');
  });

  test('does not render image when absent', () => {
    renderCard({ image: '' });
    expect(screen.queryByRole('img', { name: /Spaghetti Carbonara/i })).not.toBeInTheDocument();
  });

  test('renders all ingredients', () => {
    renderCard();
    expect(screen.getByText('200g spaghetti')).toBeInTheDocument();
    expect(screen.getByText('100g pancetta')).toBeInTheDocument();
    expect(screen.getByText('2 eggs')).toBeInTheDocument();
  });

  test('renders string instructions', () => {
    renderCard();
    expect(screen.getByText('Boil pasta.')).toBeInTheDocument();
    expect(screen.getByText('Fry pancetta.')).toBeInTheDocument();
  });

  test('renders object instructions via .text', () => {
    renderCard({
      instructions: [
        { text: 'Mix everything together.' },
        { name: 'Serve hot.' },
      ],
    });
    expect(screen.getByText('Mix everything together.')).toBeInTheDocument();
    expect(screen.getByText('Serve hot.')).toBeInTheDocument();
  });

  test('renders nothing for empty ingredients or instructions', () => {
    renderCard({ ingredients: [], instructions: [] });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('RecipeCard — source badges', () => {
  test('shows "Clipped" badge for clipped source', () => {
    renderCard({ source: 'clipped' });
    expect(screen.getByText('Clipped')).toBeInTheDocument();
  });

  test('shows "AI Generated" badge for ai_generated source', () => {
    renderCard({ source: 'ai_generated' });
    expect(screen.getByText('AI Generated')).toBeInTheDocument();
  });

  test('shows "Elevated" badge for elevated source', () => {
    renderCard({ source: 'elevated' });
    expect(screen.getByText('Elevated')).toBeInTheDocument();
  });

  test('shows fallback "Recipe" badge for unknown source', () => {
    renderCard({ source: 'unknown' });
    expect(screen.getByText('Recipe')).toBeInTheDocument();
  });
});

describe('RecipeCard — share button', () => {
  const shareUrl = 'https://recipe-view-worker.example.workers.dev/recipe/abc123';

  test('share button is not rendered when shareUrl is not provided', () => {
    renderCard();
    expect(screen.queryByTitle('Share recipe')).not.toBeInTheDocument();
  });

  test('share button is rendered when shareUrl is provided', () => {
    renderCard({}, { shareUrl });
    expect(screen.getByTitle('Share recipe')).toBeInTheDocument();
  });

  test('share button calls navigator.share when available', () => {
    const shareMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });
    renderCard({}, { shareUrl });
    fireEvent.click(screen.getByTitle('Share recipe'));
    expect(shareMock).toHaveBeenCalledWith({
      title: baseRecipe.name,
      url: shareUrl,
    });
    delete navigator.share;
  });

  test('share button copies to clipboard when navigator.share is unavailable', () => {
    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });
    renderCard({}, { shareUrl });
    fireEvent.click(screen.getByTitle('Share recipe'));
    expect(writeTextMock).toHaveBeenCalledWith(shareUrl);
  });
});

describe('RecipeCard — interactions', () => {
  test('calls onClose when close button is clicked', () => {
    const { onClose } = renderCard();
    fireEvent.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onElevate when elevate button is clicked', () => {
    const { onElevate } = renderCard();
    fireEvent.click(screen.getByTitle(/Elevate this recipe/i));
    expect(onElevate).toHaveBeenCalledTimes(1);
  });

  test('elevate button is disabled while isElevating', () => {
    renderCard({}, { isElevating: true });
    expect(screen.getByTitle(/Elevate this recipe/i)).toBeDisabled();
  });

  test('elevate button shows "Elevating…" text while isElevating', () => {
    renderCard({}, { isElevating: true });
    expect(screen.getByText('Elevating…')).toBeInTheDocument();
  });

  test('elevate button is enabled when not elevating', () => {
    renderCard();
    expect(screen.getByTitle(/Elevate this recipe/i)).not.toBeDisabled();
  });

  test('elevate button shows "Elevate" text when not elevating', () => {
    renderCard();
    expect(screen.getByText('Elevate')).toBeInTheDocument();
  });
});
