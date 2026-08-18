/**
 * Regression guard for the closed meal-planner drawer peeking into view.
 *
 * The drawer is inset from the viewport edge by a safe-area variable
 * (--safe-right on desktop, --safe-bottom for the mobile bottom sheet). A
 * closed transform of a bare `translate*(100%)` moves the panel by its own
 * size only, which stops short by exactly that inset and leaves a strip of the
 * panel permanently visible on devices with a notch or home indicator.
 *
 * These assertions read the stylesheet directly because jsdom does not resolve
 * `env()` / `calc()` or apply media queries.
 */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'MealPlanner.css'), 'utf8');

/** Returns the declaration block of the first rule whose selector list matches. */
function ruleBody(selector, { after } = {}) {
  const haystack = after ? css.slice(css.indexOf(after)) : css;
  const start = haystack.indexOf(selector);
  expect(start).toBeGreaterThan(-1);
  const open = haystack.indexOf('{', start);
  return haystack.slice(open + 1, haystack.indexOf('}', open));
}

/** Extracts the `transform:` value from a declaration block. */
function transformOf(body) {
  const match = body.match(/(?:^|\n)\s*transform:\s*([^;]+);/);
  expect(match).not.toBeNull();
  return match[1].replace(/\s+/g, ' ').trim();
}

describe('closed meal-planner drawer clears the safe-area inset', () => {
  it('slides the desktop drawer past its --safe-right inset', () => {
    const transform = transformOf(ruleBody('\n.meal-planner-drawer {'));

    expect(transform).not.toBe('translateX(100%)');
    expect(transform).toContain('--safe-right');
  });

  it('slides the mobile bottom sheet past its --safe-bottom inset', () => {
    // The mobile override lives inside the `max-width: 767px` media block.
    const body = ruleBody('.meal-planner-drawer {', { after: '@media (max-width: 767px)' });
    const transform = transformOf(body);

    expect(body).toContain('bottom: var(--safe-bottom)');
    expect(transform).not.toBe('translateY(100%)');
    expect(transform).toContain('--safe-bottom');
  });

  it('still drops the transform mid-drag so fixed-position drag ghosts line up', () => {
    expect(transformOf(ruleBody('.meal-planner-drawer.is-open.is-dragging {'))).toBe('none');
  });
});
