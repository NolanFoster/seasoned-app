import React, { useState, useEffect } from 'react';

// Feature imports
import { useRecipes } from './features/recipes/hooks/useRecipes';
import { useSearch } from './features/search/hooks/useSearch';
import { useTimersStore } from './features/timers/stores/useTimersStore';
import { useForm } from './features/forms/hooks/useForm';

// Component imports
import Header from './components/Header';
import BackgroundCanvas from './components/BackgroundCanvas';
import LoadingRecipes from './components/LoadingRecipes';
import NoRecipesFound from './components/NoRecipesFound';
import VideoPopup from './components/VideoPopup';
import SwipeableRecipeGrid from './components/SwipeableRecipeGrid';

// Feature components
import RecipePreview from './features/recipes/components/RecipePreview';
import RecipeForm from './features/recipes/components/RecipeForm';
import RecipeFullscreen from './features/recipes/components/RecipeFullscreen';
import ClipRecipeForm from './features/forms/components/ClipRecipeForm';
import Timer from './features/timers/components/Timer';
import TimerManager from './features/timers/components/TimerManager';
import Recommendations from './features/recommendations/components/Recommendations';

// Shared utilities
import { formatDuration, isValidUrl, formatIngredientAmount } from './utils';
import { getRecipeDescription, getFilteredIngredients, getFilteredInstructions } from './features/recipes/utils';

// Timer utilities
import { parseTimeString, formatTime, renderInstructionWithTimers } from './features/timers/components/TimerUtils';

const API_URL = import.meta.env.VITE_API_URL;
const CLIPPER_API_URL = import.meta.env.VITE_CLIPPER_API_URL;
const SEARCH_DB_URL = import.meta.env.VITE_SEARCH_DB_URL;
const RECIPE_VIEW_URL = import.meta.env.VITE_RECIPE_VIEW_URL;
const RECIPE_GENERATION_URL = import.meta.env.VITE_RECIPE_GENERATION_URL;

function App() {
  // Feature hooks
  const recipes = useRecipes();
  const search = useSearch();
  const timers = useTimersStore();

  // UI state
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showVideoPopup, setShowVideoPopup] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState('');
  const [titleOpacity, setTitleOpacity] = useState(1);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [userLocation, setUserLocation] = useState('');

  // Form state for recipe creation
  const recipeForm = useForm({
    name: '',
    description: '',
    ingredients: [],
    instructions: [],
    prepTime: '',
    cookTime: '',
    recipeYield: '',
    image: null
  }, {
    name: [{ type: 'required', message: 'Recipe name is required' }],
    ingredients: [{ type: 'minLength', min: 1, message: 'At least one ingredient is required' }],
    instructions: [{ type: 'minLength', min: 1, message: 'At least one instruction is required' }]
  });

  // Clipping state
  const [isClipping, setIsClipping] = useState(false);
  const [clipError, setClipError] = useState('');
  const [clipperStatus, setClipperStatus] = useState('checking');
  const [clippedRecipePreview, setClippedRecipePreview] = useState(null);
  const [editablePreview, setEditablePreview] = useState(null);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  // Search bar clipping state
  const [isSearchBarClipping, setIsSearchBarClipping] = useState(false);
  const [searchBarClipError, setSearchBarClipError] = useState(false);
  const [clipUrl, setClipUrl] = useState('');

  // AI card loading states
  const [aiCardLoadingStates, setAiCardLoadingStates] = useState(new Map());

  // Debug mode
  const DEBUG_MODE = false;

  // Helper function for debug logging
  const debugLog = (message, data = {}) => {
    if (DEBUG_MODE) {
      console.log(message, data);
    }
  };

  // Initialize app
  useEffect(() => {
    // Load recipes on mount
    recipes.loadRecipes();
    
    // Check clipper status
    checkClipperStatus();
    
    // Get user location
    getUserLocation();
  }, []);

  // Check clipper worker status
  const checkClipperStatus = async () => {
    try {
      const response = await fetch(`${CLIPPER_API_URL}/health`);
      if (response.ok) {
        setClipperStatus('available');
      } else {
        setClipperStatus('unavailable');
      }
    } catch (error) {
      console.error('Clipper status check failed:', error);
      setClipperStatus('unavailable');
    }
  };

  // Get user location
  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation(`${latitude},${longitude}`);
        },
        (error) => {
          console.warn('Geolocation error:', error);
        }
      );
    }
  };

  // Handle recipe save
  const handleSaveRecipe = async (recipeData) => {
    try {
      setIsSavingRecipe(true);
      await recipes.saveRecipe(recipeData);
      setShowAddForm(false);
      recipeForm.resetForm();
    } catch (error) {
      console.error('Error saving recipe:', error);
    } finally {
      setIsSavingRecipe(false);
    }
  };

  // Handle recipe clip
  const handleClipRecipe = async (url) => {
    if (!isValidUrl(url)) {
      setClipError('Please enter a valid URL');
      return;
    }

    try {
      setIsClipping(true);
      setClipError('');
      
      const clippedRecipe = await recipes.clipRecipe(url);
      setClippedRecipePreview(clippedRecipe);
    } catch (error) {
      console.error('Error clipping recipe:', error);
      setClipError('Failed to clip recipe. Please try again.');
    } finally {
      setIsClipping(false);
    }
  };

  // Handle search
  const handleSearch = async (query) => {
    if (!query.trim()) {
      search.clearSearch();
      return;
    }

    await search.search(query);
  };

  // Handle video popup
  const handleVideoClick = (videoUrl) => {
    setCurrentVideoUrl(videoUrl);
    setShowVideoPopup(true);
  };

  // Handle scroll for title opacity
  const handleScroll = (e) => {
    const scrollTop = e.target.scrollTop;
    const opacity = Math.max(0, 1 - scrollTop / 200);
    setTitleOpacity(opacity);
  };

  return (
    <>
      <div className="app" onScroll={handleScroll}>
        <BackgroundCanvas />
        
        <Header
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          isDarkMode={isDarkMode}
          onSearch={handleSearch}
          searchQuery={search.query}
          onSearchChange={search.setQuery}
          isSearching={search.isSearching}
          onClipUrl={handleClipRecipe}
          clipUrl={clipUrl}
          setClipUrl={setClipUrl}
          isClipping={isClipping}
          clipError={clipError}
        />

        <main className="main-content">
          {/* Title Section */}
          <div className="title-section" style={{ opacity: titleOpacity }}>
            <h1>Recipe Collection</h1>
            <p>Discover, save, and cook amazing recipes</p>
          </div>

          {/* Recommendations */}
          <Recommendations
            onRecipeSelect={recipes.selectRecipe}
            onVideoClick={handleVideoClick}
            userLocation={userLocation}
            aiCardLoadingStates={aiCardLoadingStates}
            setAiCardLoadingStates={setAiCardLoadingStates}
          />

          {/* Recipe Grid */}
          {recipes.isLoading ? (
            <LoadingRecipes />
          ) : recipes.recipes.length === 0 ? (
            <NoRecipesFound />
          ) : (
            <SwipeableRecipeGrid>
              {recipes.recipes.map((recipe) => (
                <div key={recipe.id} className="recipe-card">
                  <RecipePreview
                    recipe={recipe}
                    onSelect={() => recipes.selectRecipe(recipe)}
                    onEdit={() => recipes.setEditingRecipe(recipe)}
                    onDelete={() => recipes.deleteRecipe(recipe.id)}
                  />
                </div>
              ))}
            </SwipeableRecipeGrid>
          )}

          {/* Add Recipe Button */}
          <button
            className="fab"
            onClick={() => setShowAddForm(true)}
            title="Add Recipe"
          >
            +
          </button>

          {/* Timer Manager */}
          <TimerManager
            activeTimers={timers.activeTimers}
            onCreateTimer={timers.createTimer}
            onStartTimer={timers.startTimer}
            onPauseTimer={timers.pauseTimer}
            onResumeTimer={timers.resumeTimer}
            onStopTimer={timers.stopTimer}
            onResetTimer={timers.resetTimer}
            onDeleteTimer={timers.deleteTimer}
          />
        </main>

        {/* Recipe Form Modal */}
        {showAddForm && (
          <div className="modal-overlay">
            <RecipeForm
              form={recipeForm}
              onSubmit={handleSaveRecipe}
              onClose={() => setShowAddForm(false)}
              isSubmitting={isSavingRecipe}
            />
          </div>
        )}

        {/* Recipe Fullscreen */}
        {recipes.selectedRecipe && (
          <RecipeFullscreen
            recipe={recipes.selectedRecipe}
            onClose={recipes.clearSelectedRecipe}
            onEdit={() => {
              recipes.setEditingRecipe(recipes.selectedRecipe);
              recipes.clearSelectedRecipe();
            }}
            onDelete={() => {
              recipes.deleteRecipe(recipes.selectedRecipe.id);
              recipes.clearSelectedRecipe();
            }}
            onVideoClick={handleVideoClick}
            onShare={() => setShowSharePanel(true)}
            onNutrition={() => setShowNutrition(true)}
            getRecipeDescription={getRecipeDescription}
            getFilteredIngredients={getFilteredIngredients}
            getFilteredInstructions={getFilteredInstructions}
            formatIngredientAmount={formatIngredientAmount}
            renderInstructionWithTimers={renderInstructionWithTimers}
          />
        )}

        {/* Recipe Edit Modal */}
        {recipes.editingRecipe && (
          <div className="modal-overlay">
            <RecipeForm
              initialValues={recipes.editingRecipe}
              onSubmit={(updates) => {
                recipes.updateRecipe(recipes.editingRecipe.id, updates);
                recipes.clearEditingRecipe();
              }}
              onClose={recipes.clearEditingRecipe}
              isSubmitting={isSavingRecipe}
            />
          </div>
        )}

        {/* Clip Recipe Modal */}
        {clippedRecipePreview && (
          <div className="modal-overlay">
            <ClipRecipeForm
              recipe={clippedRecipePreview}
              onSave={handleSaveRecipe}
              onClose={() => {
                setClippedRecipePreview(null);
                setClipError('');
              }}
              isSaving={isSavingRecipe}
            />
          </div>
        )}

        {/* Video Popup */}
        {showVideoPopup && (
          <VideoPopup
            videoUrl={currentVideoUrl}
            onClose={() => setShowVideoPopup(false)}
          />
        )}
      </div>
    </>
  );
}

export default App;
