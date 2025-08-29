import { vi } from 'vitest';

// Mock the shared kv-storage library
export const getRecipeFromKV = vi.fn();
export const decompressData = vi.fn();
export const compressData = vi.fn();
export const generateRecipeId = vi.fn();
export const recipeExistsInKV = vi.fn();
export const getRecipeMetadata = vi.fn();
