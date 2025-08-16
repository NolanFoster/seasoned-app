// Common mock setup for tests
export const setupCanvasMock = () => {
  const mockCanvasContext = {
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    drawImage: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    closePath: jest.fn(),
    stroke: jest.fn(),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    canvas: { width: 1024, height: 768 },
  };
  
  HTMLCanvasElement.prototype.getContext = jest.fn(() => mockCanvasContext);
  
  return mockCanvasContext;
};

export const setupIntersectionObserverMock = () => {
  const mockIntersectionObserver = jest.fn();
  mockIntersectionObserver.mockReturnValue({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  });
  global.IntersectionObserver = mockIntersectionObserver;
  return mockIntersectionObserver;
};

export const setupMatchMediaMock = (matches = false) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
};

export const setupAnimationFrameMock = () => {
  global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 0));
  global.cancelAnimationFrame = jest.fn(id => clearTimeout(id));
};

export const setupFileReaderMock = () => {
  global.FileReader = jest.fn(() => ({
    readAsDataURL: jest.fn(function() {
      this.onload({ target: { result: 'data:image/png;base64,fake' } });
    }),
    result: 'data:image/png;base64,fake',
  }));
};

export const setupGlobalMocks = () => {
  global.fetch = jest.fn();
  global.alert = jest.fn();
  global.confirm = jest.fn(() => true);
  setupCanvasMock();
  setupIntersectionObserverMock();
  setupMatchMediaMock();
  setupAnimationFrameMock();
  setupFileReaderMock();
};