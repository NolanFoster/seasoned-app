import { useEffect, useState, useRef } from 'react'
import { formatDuration, isValidUrl } from '../../shared/utility-functions.js'
import VideoPopup from './components/VideoPopup.jsx'
import Recommendations from './components/Recommendations.jsx'
import SwipeableRecipeGrid from './components/SwipeableRecipeGrid.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'https://recipe-scraper.nolanfoster.workers.dev'; // Main recipe worker with KV storage
const CLIPPER_API_URL = import.meta.env.VITE_CLIPPER_API_URL || 'https://recipe-clipper-worker.nolanfoster.workers.dev'; // Clipper worker
const SEARCH_DB_URL = import.meta.env.VITE_SEARCH_DB_URL || 'https://recipe-search-db.nolanfoster.workers.dev'; // Search database worker
const SAVE_WORKER_URL = import.meta.env.VITE_SAVE_WORKER_URL || 'https://recipe-save-worker.nolanfoster.workers.dev'; // Recipe save worker



function App() {
  // Debug flag - set to true to enable detailed logging
  const DEBUG_MODE = false;
  
  // Helper function for debug logging
  const debugLog = (message, data = {}) => {
    if (DEBUG_MODE) {
      console.log(message, data);
    }
  };
  
  // Helper function for debug logging with emojis
  const debugLogEmoji = (emoji, message, data = {}) => {
    if (DEBUG_MODE) {
      console.log(`${emoji} ${message}`, data);
    }
  };
  
  // Recipes are now populated by the recommendations system instead of direct API calls
  const [recipes, setRecipes] = useState([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(false); // Loading state for recipes
  const [recipeCategories, setRecipeCategories] = useState([]); // Store category names for loading display
  const [cachedCategoryNames, setCachedCategoryNames] = useState([]); // Cache category names for instant display
  const [searchCache, setSearchCache] = useState(new Map()); // Cache search results by query
  const [isRefreshingRecipes, setIsRefreshingRecipes] = useState(false); // Prevent multiple simultaneous refreshes
  const [isInitializing, setIsInitializing] = useState(true); // Track if we're in initial load
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [recipeYield, setRecipeYield] = useState('');
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [clippedRecipePreview, setClippedRecipePreview] = useState(null);
  const [isClipping, setIsClipping] = useState(false);
  const [clipError, setClipError] = useState('');
  const [clipperStatus, setClipperStatus] = useState('checking'); // 'checking', 'available', 'unavailable'
  const [titleOpacity, setTitleOpacity] = useState(1); // For fading title section on scroll
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editablePreview, setEditablePreview] = useState(null);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState(0);
  const [showVideoPopup, setShowVideoPopup] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState('');
  const [editableRecipe, setEditableRecipe] = useState(null);
  const [isEditingRecipe, setIsEditingRecipe] = useState(false);
  const [searchInput, setSearchInput] = useState(''); // New state for search input
  const [isSearchBarClipping, setIsSearchBarClipping] = useState(false); // Loading state for search bar
  const [searchBarClipError, setSearchBarClipError] = useState(false); // Error state for search bar
  const [clipUrl, setClipUrl] = useState('');
  const [searchResults, setSearchResults] = useState([]); // New state for search results
  const [isSearching, setIsSearching] = useState(false); // New state for search loading
  const [showSearchResults, setShowSearchResults] = useState(false); // New state to show/hide search results
  const [recipesByCategory, setRecipesByCategory] = useState(new Map()); // Store recipes organized by category
  const [showSharePanel, setShowSharePanel] = useState(false); // New state for share panel
  const [showNutrition, setShowNutrition] = useState(false); // State for toggling nutrition view
  const seasoningCanvasRef = useRef(null);
  const seasoningRef = useRef(null);
  const recipeGridRef = useRef(null);
  const recipeFullscreenRef = useRef(null);
  const searchTimeoutRef = useRef(null); // Add ref for debounce timeout
  const recipeContentRef = useRef(null);

  // Helper function to add timeout to fetch calls
  function fetchWithTimeout(url, options = {}) {
    const { timeout = 10000, ...fetchOptions } = options;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    return fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    }).finally(() => {
      clearTimeout(timeoutId);
    });
  }

  // Smart search function using the search worker
  async function smartSearch(tag) {
    try {
      debugLogEmoji('🔍', `Using smart search for tag "${tag}"`);
      const searchRes = await fetchWithTimeout(
        `${SEARCH_DB_URL}/api/smart-search?q=${encodeURIComponent(tag)}&type=RECIPE&limit=6`,
        { timeout: 10000 }
      );
      
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        debugLogEmoji('✅', `Smart search succeeded for "${tag}": found ${searchData.results.length} recipes`);
        return searchData.results || [];
      }
      return [];
    } catch (error) {
      console.warn(`⚠️ Smart search failed for "${tag}":`, error);
      return [];
    }
  }

  // Function to fetch complete recipe data from KV storage via recipe-save-worker
  // This fixes the issue where smart search returns limited data and full recipe data
  // needs to be fetched from the recipe-save-worker which has direct KV access
  async function fetchCompleteRecipeData(recipeId) {
    try {
      debugLogEmoji('🔍', `Fetching complete recipe data for ID: ${recipeId}`);
      
      // First try the recipe-save-worker which has direct KV access
      // The worker routes /recipe/get to the Durable Object's /get endpoint
      const response = await fetchWithTimeout(
        `${SAVE_WORKER_URL}/recipe/get?id=${recipeId}`,
        { timeout: 15000 }
      );
      
      if (response.ok) {
        const recipeData = await response.json();
        
        // Validate that we got meaningful recipe data
        // Recipe-save-worker returns data in a nested structure: { id, url, data: { actual recipe data } }
        const actualRecipeData = recipeData.data || recipeData;
        if (recipeData && actualRecipeData && (actualRecipeData.title || actualRecipeData.name)) {
          debugLogEmoji('✅', `Complete recipe data fetched from save worker for ID: ${recipeId}`, {
            hasData: !!actualRecipeData,
            hasTitle: !!(actualRecipeData.title || actualRecipeData.name),
            hasIngredients: !!(actualRecipeData.ingredients && actualRecipeData.ingredients.length > 0),
            hasInstructions: !!(actualRecipeData.instructions && actualRecipeData.instructions.length > 0),
            ingredientCount: actualRecipeData.ingredients?.length || 0,
            instructionCount: actualRecipeData.instructions?.length || 0
          });
          
          // Return the recipe data in the expected format
          // If recipeData already has a data property, use it as-is, otherwise wrap it
          return recipeData.data ? recipeData : {
            id: recipeId,
            data: recipeData
          };
        } else {
          debugLogEmoji('⚠️', `Invalid recipe data from save worker for ID: ${recipeId}`, recipeData);
        }
      } else {
        const errorText = await response.text();
        debugLogEmoji('⚠️', `Save worker request failed for ID: ${recipeId}`, {
          status: response.status,
          error: errorText
        });
      }
      
      // Fallback to the old API endpoint
      debugLogEmoji('🔄', `Falling back to old API for recipe ID: ${recipeId}`);
      const fallbackResponse = await fetchWithTimeout(
        `${API_URL}/recipes?id=${recipeId}`,
        { timeout: 15000 }
      );
      
      if (fallbackResponse.ok) {
        const completeRecipe = await fallbackResponse.json();
        debugLogEmoji('✅', `Complete recipe data fetched from fallback API for ID: ${recipeId}`, {
          hasData: !!completeRecipe.data,
          hasTitle: !!(completeRecipe.data?.title || completeRecipe.title),
          hasIngredients: !!(completeRecipe.data?.ingredients || completeRecipe.ingredients),
          hasInstructions: !!(completeRecipe.data?.instructions || completeRecipe.instructions)
        });
        return completeRecipe;
      } else {
        const errorText = await fallbackResponse.text();
        console.warn(`⚠️ Both save worker and fallback API failed for recipe ID: ${recipeId}`, {
          saveWorkerStatus: response?.status,
          fallbackStatus: fallbackResponse.status,
          fallbackError: errorText
        });
        return null;
      }
    } catch (error) {
      console.warn(`⚠️ Error fetching complete recipe data for ID: ${recipeId}:`, error);
      return null;
    }
  }



  useEffect(() => {
    // Initialize with recommendations instead of fetchRecipes
    // First get categories for loading display, then get full recipes
    const initializeRecipes = async () => {
      setIsLoadingRecipes(true); // Start loading state immediately
      
      // Add a small delay to prevent rapid state changes and ensure smooth loading
      const minLoadingTime = 800; // Minimum loading time in milliseconds
      const startTime = Date.now();
      
      try {
        await getRecipeCategories(); // Get category names first
        await getRecipesFromRecommendations(); // Then get full recipes
        
        // Ensure minimum loading time for smooth UX
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < minLoadingTime) {
          await new Promise(resolve => setTimeout(resolve, minLoadingTime - elapsedTime));
        }
      } catch (error) {
        console.error('❌ Error during initialization:', error);
        // Even if there's an error, we should show some content
        setRecipes([]);
      } finally {
        setIsInitializing(false); // Mark initialization as complete
        setIsLoadingRecipes(false); // Ensure loading state is cleared
        console.log('✅ Initialization completed');
      }
    };
    initializeRecipes();
    checkClipperHealth(); // Check clipper worker health on startup
  }, []);

  // Monitor changes to recipesByCategory for debugging
  useEffect(() => {
    debugLogEmoji('🔄', 'App: recipesByCategory state changed:', {
      hasRecipesByCategory: Boolean(recipesByCategory),
      size: recipesByCategory?.size || 0,
      categories: recipesByCategory ? Array.from(recipesByCategory.keys()) : [],
      timestamp: new Date().toISOString()
    });
    
    // Log sample recipes from each category
    if (recipesByCategory && recipesByCategory.size > 0) {
      for (const [categoryName, recipes] of recipesByCategory.entries()) {
        if (recipes.length > 0) {
          const sampleRecipe = recipes[0];
          debugLogEmoji('📋', `App: Sample recipe from "${categoryName}":`, {
            id: sampleRecipe.id,
            name: sampleRecipe.name,
            hasIngredients: sampleRecipe.ingredients?.length > 0,
            hasInstructions: sampleRecipe.instructions?.length > 0,
            ingredientCount: sampleRecipe.ingredients?.length || 0,
            instructionCount: sampleRecipe.instructions?.length || 0
          });
        }
      }
    }
  }, [recipesByCategory]);

  // Clear loading state when recipes are loaded and initialization is complete
  useEffect(() => {
    if (!isInitializing && recipes.length > 0 && isLoadingRecipes) {
      setIsLoadingRecipes(false);
    }
  }, [isInitializing, recipes.length, isLoadingRecipes]);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if the click is outside the search bar and search results
      const searchBar = document.querySelector('.title-search');
      const searchResults = document.querySelector('.search-results-dropdown');
      
      if (searchBar && !searchBar.contains(event.target) && 
          searchResults && !searchResults.contains(event.target)) {
        setShowSearchResults(false);
      }
    };

    if (showSearchResults) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSearchResults]);

  // Close share panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const sharePanel = document.querySelector('.share-panel');
      const shareTrigger = document.querySelector('.fab-share-trigger');
      
      if (sharePanel && !sharePanel.contains(event.target) && 
          shareTrigger && !shareTrigger.contains(event.target)) {
        setShowSharePanel(false);
      }
    };

    if (showSharePanel) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSharePanel]);

  // Scroll-based glass reflection effect
  useEffect(() => {
    let ticking = false;
    let scrollY = 0;
    
    const updateScrollEffects = () => {
      if (!recipeGridRef.current) {
        ticking = false;
        return;
      }
      
      const cards = recipeGridRef.current.querySelectorAll('.recipe-card');
      const windowHeight = window.innerHeight;
      
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const cardTop = rect.top + scrollY;
        const cardCenter = cardTop + rect.height / 2;
        const distanceFromCenter = Math.abs(scrollY + windowHeight / 2 - cardCenter);
        const maxDistance = windowHeight;
        const intensity = Math.max(0, 1 - distanceFromCenter / maxDistance);
        
        // Apply dynamic styles based on scroll position
        card.style.setProperty('--glass-intensity', intensity);
        card.style.setProperty('--reflection-offset', `${scrollY * 0.1}px`);
        
        // Add subtle rotation based on position
        const rotation = (rect.left / window.innerWidth - 0.5) * 2;
        card.style.setProperty('--card-rotation', `${rotation}deg`);
      });
      
      ticking = false;
    };
    
    const handleScroll = () => {
      scrollY = window.scrollY;
      
      // Fade title based on scroll position
      const headerElement = document.querySelector('.header-container');
      if (headerElement) {
        if (scrollY > 50) {
          headerElement.classList.add('fade-out');
        } else {
          headerElement.classList.remove('fade-out');
        }
      }
      
      if (!ticking) {
        window.requestAnimationFrame(updateScrollEffects);
        ticking = true;
      }
    };
    
    // Add passive option for better scroll performance
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial call
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, [recipes]);

  // Scroll-based fade effect for recipe fullscreen title
  useEffect(() => {
    if (!selectedRecipe || !recipeFullscreenRef.current) return;

    let ticking = false;

    const handleRecipeScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (!recipeFullscreenRef.current) {
            ticking = false;
            return;
          }

          const scrollTop = recipeFullscreenRef.current.scrollTop;
          const fadeStartOffset = 50; // Start fading after 50px of scroll
          const fadeEndOffset = 150; // Fully fade by 150px

          // Calculate opacity based on scroll position
          let opacity = 1;
          if (scrollTop > fadeStartOffset) {
            opacity = Math.max(0, 1 - (scrollTop - fadeStartOffset) / (fadeEndOffset - fadeStartOffset));
          }

          setTitleOpacity(opacity);
          ticking = false;
        });
        ticking = true;
      }
    };

    const scrollContainer = recipeFullscreenRef.current;
    scrollContainer.addEventListener('scroll', handleRecipeScroll, { passive: true });
    
    // Reset opacity when recipe changes
    setTitleOpacity(1);
    
    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleRecipeScroll);
      }
    };
  }, [selectedRecipe]);

  // Dark mode detection and background initialization
  useEffect(() => {
    const checkDarkMode = () => {
      const supportsMatchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
      const darkMode = supportsMatchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
      setIsDarkMode(darkMode);
      
      // Always initialize seasoning background for both light and dark modes
      if (seasoningCanvasRef.current && !seasoningRef.current) {
        setTimeout(() => {
          if (seasoningCanvasRef.current && !seasoningRef.current) {
            initializeSeasoningBackground();
          }
        }, 100);
      }

    };

    // Check initial dark mode
    checkDarkMode();
    
    // Listen for dark mode changes
    const supportsMatchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
    const mediaQuery = supportsMatchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    mediaQuery && mediaQuery.addEventListener('change', checkDarkMode);
    
    return () => {
      mediaQuery && mediaQuery.removeEventListener('change', checkDarkMode);
      // Clean up on unmount
      cleanupSeasoningBackground();
    };

  }, []);



  // Clean up seasoning background
  const cleanupSeasoningBackground = () => {
    if (seasoningRef.current) {
      // Stop the animation by setting the ref to null
      seasoningRef.current = null;
    }
  };

  // Initialize seasoning background using custom star animation
  const initializeSeasoningBackground = () => {
    if (!seasoningCanvasRef.current || seasoningRef.current) return;
    
    try {
      const canvas = seasoningCanvasRef.current;
      const ctx = canvas.getContext('2d');
      
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      console.log('Initializing custom seasoning background...');
      console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
      
      // Create seasoning data
      const seasoningParticles = [];
      const numParticles = 100; // Increased from 50 for more density
      
      for (let i = 0; i < numParticles; i++) {
        // Add color variety for culinary seasoning
        const colorVariation = Math.random();
        let particleColor;
        let particleSize;
        let particleType;
        
        if (colorVariation < 0.4) {
          particleColor = 'rgba(220, 53, 69, '; // Red seasoning (40%)
          particleSize = Math.random() * 3 + 2; // Red: 2 to 5 (largest)
          particleType = 'pepper';
        } else if (colorVariation < 0.7) {
          particleColor = 'rgba(139, 69, 19, '; // Brown seasoning (30%)
          particleSize = Math.random() * 2.5 + 1.5; // Brown: 1.5 to 4 (medium)
          particleType = 'circle';
        } else {
          particleColor = 'rgba(34, 139, 34, '; // Dark green seasoning (30%)
          particleSize = Math.random() * 4 + 2; // Dark green: 2 to 6 (larger)
          particleType = 'leaf';
        }
        
        seasoningParticles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: particleSize,
          opacity: Math.random() * 0.8 + 0.3, // Higher opacity range: 0.3 to 1.1
          speed: Math.random() * 0.2 + 0.1, // Much slower speed: 0.1 to 0.3
          color: particleColor,
          type: particleType,
          rotation: Math.random() * Math.PI * 2, // Random rotation for leaves and peppers
          rotationSpeed: (Math.random() - 0.5) * 0.02, // Slow rotation speed
          twinkle: Math.random() * Math.PI * 2, // Random twinkle phase
          twinkleSpeed: Math.random() * 0.01 + 0.005 // Twinkle speed
        });
      }
      
      console.log('Created', seasoningParticles.length, 'seasoning particles');
      console.log('Sample particle:', seasoningParticles[0]);
      
      // Animation function
      const animate = () => {
        if (!seasoningRef.current) return; // Stop if cleaned up
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        seasoningParticles.forEach(particle => {
          // Move particle
          particle.y += particle.speed;
          if (particle.y > canvas.height) {
            particle.y = 0;
            particle.x = Math.random() * canvas.width;
          }
          
          // Update rotation for leaves and peppers
          if (particle.type === 'leaf' || particle.type === 'pepper') {
            particle.rotation += particle.rotationSpeed;
          }
          
          // Update twinkle
          particle.twinkle += particle.twinkleSpeed;
          
          // Calculate twinkling opacity
          const twinkleOpacity = particle.opacity * (0.7 + 0.3 * Math.sin(particle.twinkle));
          
          // Draw particle based on type
          if (particle.type === 'leaf') {
            // Draw leaf shape
            ctx.save();
            ctx.translate(particle.x, particle.y);
            ctx.rotate(particle.rotation);
            
            // Create leaf shape using bezier curves
            ctx.beginPath();
            ctx.moveTo(0, -particle.size);
            ctx.bezierCurveTo(
              particle.size * 0.8, -particle.size * 0.8,
              particle.size * 1.2, 0,
              particle.size * 0.8, particle.size * 0.8
            );
            ctx.bezierCurveTo(
              particle.size * 0.4, particle.size * 0.4,
              0, particle.size * 0.2,
              0, -particle.size
            );
            
            ctx.fillStyle = `${particle.color}${twinkleOpacity})`;
            ctx.fill();
            ctx.restore();
          } else if (particle.type === 'pepper') {
            // Draw pepper shape
            ctx.save();
            ctx.translate(particle.x, particle.y);
            ctx.rotate(particle.rotation);
            
            // Create pepper shape - elongated with rounded ends
            ctx.beginPath();
            ctx.moveTo(-particle.size * 0.8, 0);
            ctx.lineTo(-particle.size * 0.3, -particle.size * 0.6);
            ctx.quadraticCurveTo(
              -particle.size * 0.1, -particle.size * 0.8,
              particle.size * 0.1, -particle.size * 0.8
            );
            ctx.quadraticCurveTo(
              particle.size * 0.3, -particle.size * 0.6,
              particle.size * 0.8, 0
            );
            ctx.quadraticCurveTo(
              particle.size * 0.3, particle.size * 0.6,
              particle.size * 0.1, particle.size * 0.8
            );
            ctx.quadraticCurveTo(
              -particle.size * 0.1, particle.size * 0.8,
              -particle.size * 0.3, particle.size * 0.6
            );
            ctx.closePath();
            
            ctx.fillStyle = `${particle.color}${twinkleOpacity})`;
            ctx.fill();
            ctx.restore();
          } else {
            // Draw circle for seasoning
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fillStyle = `${particle.color}${twinkleOpacity})`;
            ctx.fill();
          }
        });
        
        requestAnimationFrame(animate);
      };
      
      // Store animation reference
      seasoningRef.current = { animate, seasoningParticles, canvas, ctx };
      
      // Start animation
      animate();
      
      console.log('Custom seasoning background initialized successfully');
    } catch (error) {
      console.error('Failed to initialize seasoning background:', error);
      seasoningRef.current = null;
    }
  };

  // Handle window resize for seasoning background
  useEffect(() => {
    const handleResize = () => {
      // Handle seasoning background resize
      if (seasoningCanvasRef.current && seasoningRef.current) {
        const canvas = seasoningCanvasRef.current;
        const ctx = seasoningRef.current.ctx;
        
        // Update canvas size
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        // Update seasoning positions for new canvas size
        if (seasoningRef.current.seasoningParticles) {
          seasoningRef.current.seasoningParticles.forEach(particle => {
            if (particle.x > canvas.width) particle.x = Math.random() * canvas.width;
            if (particle.y > canvas.height) particle.y = Math.random() * canvas.height;
          });
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  // Function to get just the category names first for loading display
  async function getRecipeCategories() {
    try {
      const RECOMMENDATION_API_URL = import.meta.env.VITE_RECOMMENDATION_API_URL || 'https://recipe-recommendation-worker.nolanfoster.workers.dev';
      
      const res = await fetchWithTimeout(`${RECOMMENDATION_API_URL}/recommendations`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: 'San Francisco, CA', // Default location
          date: new Date().toISOString().split('T')[0]
        }),
        timeout: 15000 // 15 second timeout for recommendations
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.recommendations) {
          // Extract just the category names
          const categories = Object.keys(data.recommendations);
          setRecipeCategories(categories);
          // Cache the category names for instant display on refreshes
          setCachedCategoryNames(categories);
          return categories;
        }
      }
      return [];
    } catch (e) {
      console.error('Error getting recipe categories:', e);
      return [];
    }
  }

  // Function to get recipes from recommendations system
  async function getRecipesFromRecommendations() {
    // Prevent multiple simultaneous refreshes
    if (isRefreshingRecipes) {
      console.log('🔄 Recipe refresh already in progress, skipping...');
      return;
    }
    
    try {
      setIsRefreshingRecipes(true);
      // Only set loading state if it's not already set (prevents flickering)
      // This prevents conflicts when called from functions that already set isLoadingRecipes
      if (!isLoadingRecipes) {
        setIsLoadingRecipes(true);
      }
      
      const RECOMMENDATION_API_URL = import.meta.env.VITE_RECOMMENDATION_API_URL || 'https://recipe-recommendation-worker.nolanfoster.workers.dev';
      const SEARCH_DB_URL = import.meta.env.VITE_SEARCH_DB_URL || 'https://recipe-search-db.nolanfoster.workers.dev';
      
      // Clear search cache when refreshing recipes to ensure fresh search results
      clearSearchCache();
      
      // Get recommendations
      const res = await fetchWithTimeout(`${RECOMMENDATION_API_URL}/recommendations`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: 'San Francisco, CA', // Default location
          date: new Date().toISOString().split('T')[0]
        }),
        timeout: 15000 // 15 second timeout for recommendations
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.recommendations) {
          console.log('📋 Processing recommendations for categories:', Object.keys(data.recommendations));
          // Collect all recipes from all categories using a Map
          const newRecipesByCategory = new Map();
          const searchPromises = [];
          
          for (const [categoryName, tags] of Object.entries(data.recommendations)) {
            if (Array.isArray(tags)) {
              debugLogEmoji('📂', `Processing category "${categoryName}" with ${tags.length} tags`);
              // Initialize category in the map
              newRecipesByCategory.set(categoryName, []);
              
              // Create search promises for each tag using smart search
              for (const tag of tags) {
                debugLogEmoji('🏷️', `Processing tag: "${tag}"`);
                
                // Create an async function for processing each tag
                const processTag = async () => {
                  try {
                    const recipes = await smartSearch(tag);
                    if (recipes && recipes.length > 0) {
                      debugLogEmoji('✅', `Tag "${tag}" successfully found ${recipes.length} recipes`);
                      
                      // Fetch complete recipe data from KV for each recipe
                      const completeRecipes = [];
                      debugLogEmoji('🔄', `Fetching complete data for ${recipes.length} recipes from KV...`);
                      for (let i = 0; i < recipes.length; i++) {
                        const recipe = recipes[i];
                        debugLogEmoji('📥', `[${i + 1}/${recipes.length}] Fetching recipe ${recipe.id}...`);
                        const completeRecipe = await fetchCompleteRecipeData(recipe.id);
                        if (completeRecipe) {
                          completeRecipes.push(completeRecipe);
                          debugLogEmoji('✅', `[${i + 1}/${recipes.length}] Recipe ${recipe.id} fetched successfully`);
                        } else {
                          // Fallback to search result if KV fetch fails
                          console.warn(`⚠️ [${i + 1}/${recipes.length}] KV fetch failed for recipe ${recipe.id}, using search result`);
                          completeRecipes.push(recipe);
                        }
                      }
                      debugLogEmoji('🎯', `Completed KV fetching: ${completeRecipes.length}/${recipes.length} recipes retrieved`);
                      
                      // Transform complete recipes to frontend format
                      const transformedRecipes = completeRecipes.map(recipe => {
                        // Handle both KV format and search result format
                        const recipeData = recipe.data || recipe;
                        const transformed = {
                          id: recipe.id || recipeData.id,
                          name: recipeData.name || recipeData.title || '',
                          description: recipeData.description || '',
                          image: recipeData.image || recipeData.imageUrl || recipeData.image_url || '',
                          image_url: recipeData.image || recipeData.imageUrl || recipeData.image_url || '',
                          ingredients: recipeData.ingredients || recipeData.recipeIngredient || [],
                          instructions: recipeData.instructions || recipeData.recipeInstructions || [],
                          recipeIngredient: recipeData.ingredients || recipeData.recipeIngredient || [],
                          recipeInstructions: recipeData.instructions || recipeData.recipeInstructions || [],
                          prep_time: recipeData.prepTime || recipeData.prep_time || null,
                          cook_time: recipeData.cookTime || recipeData.cook_time || null,
                          recipe_yield: recipeData.recipeYield || recipeData.recipe_yield || recipeData.yield || null,
                          source_url: recipeData.source_url || recipeData.url || '',
                          video_url: recipeData.video?.contentUrl || recipeData.video_url || null,
                          video: recipeData.video || null,
                          author: recipeData.author || '',
                          datePublished: recipeData.datePublished || '',
                          recipeCategory: recipeData.recipeCategory || '',
                          recipeCuisine: recipeData.recipeCuisine || '',
                          keywords: recipeData.keywords || '',
                          nutrition: recipeData.nutrition || {},
                          aggregateRating: recipeData.aggregateRating || {}
                        };
                        
                        // Debug: Log what we're actually transforming
                        debugLogEmoji('🔍', `Transformed recipe ${transformed.id}:`, {
                          name: transformed.name,
                          hasIngredients: transformed.ingredients.length > 0,
                          hasInstructions: transformed.instructions.length > 0,
                          ingredientCount: transformed.ingredients.length,
                          instructionCount: transformed.instructions.length
                        });
                        
                        return transformed;
                      });
                      
                      debugLogEmoji('🎯', `Category "${categoryName}" now has ${transformedRecipes.length} complete recipes`);
                      return { category: categoryName, recipes: transformedRecipes };
                    } else {
                      debugLogEmoji('⚠️', `Tag "${tag}" found no recipes`);
                      return { category: categoryName, recipes: [] };
                    }
                  } catch (error) {
                    console.warn(`❌ Smart search failed for tag "${tag}":`, error);
                    return { category: categoryName, recipes: [] }; // Return empty array for failed searches
                  }
                };
                
                searchPromises.push(processTag());
              }
            }
          }
          
          // Wait for all search promises to resolve (with timeout)
          try {
            const searchResults = await Promise.allSettled(searchPromises);
            searchResults.forEach(result => {
              if (result.status === 'fulfilled' && result.value && result.value.category) {
                const { category, recipes } = result.value;
                const existingRecipes = newRecipesByCategory.get(category) || [];
                newRecipesByCategory.set(category, [...existingRecipes, ...recipes]);
              }
            });
          } catch (error) {
            console.error('Error processing search results:', error);
          }
          
          // Log results by category and collect all unique recipes
          let totalUniqueRecipes = 0;
          const allRecipes = [];
          const seenRecipeIds = new Set(); // Track seen recipe IDs across all categories
          
          // First pass: collect all recipes and track seen IDs
          for (const [categoryName, recipes] of newRecipesByCategory.entries()) {
            debugLogEmoji('📊', `Category "${categoryName}": ${recipes.length} total recipes`);
            allRecipes.push(...recipes);
          }
          
          // Remove duplicates across all categories
          const uniqueRecipes = allRecipes.filter((recipe, index, self) => 
            index === self.findIndex(r => r.id === recipe.id)
          );
          
          debugLogEmoji('📊', `Found ${allRecipes.length} total recipes and ${uniqueRecipes.length} unique recipes across all categories`);
          
          // Now rebuild recipesByCategory with no duplicates across categories
          const deduplicatedRecipesByCategory = new Map();
          const usedRecipeIds = new Set();
          let totalDuplicatesRemoved = 0;
          const recipeCategoryMapping = new Map(); // Track which category each recipe ended up in
          
          // First pass: identify which category should "own" each recipe
          for (const [categoryName, recipes] of newRecipesByCategory.entries()) {
            for (const recipe of recipes) {
              if (!recipeCategoryMapping.has(recipe.id)) {
                recipeCategoryMapping.set(recipe.id, categoryName);
              }
            }
          }
          
          // Second pass: build deduplicated categories based on ownership
          for (const [categoryName, recipes] of newRecipesByCategory.entries()) {
            const uniqueCategoryRecipes = [];
            let categoryDuplicatesRemoved = 0;
            
            for (const recipe of recipes) {
              if (recipeCategoryMapping.get(recipe.id) === categoryName) {
                // This category owns this recipe
                uniqueCategoryRecipes.push(recipe);
                usedRecipeIds.add(recipe.id);
              } else {
                // This recipe belongs to another category
                debugLogEmoji('🔄', `Skipping duplicate recipe ${recipe.id} in category "${categoryName}" (belongs to "${recipeCategoryMapping.get(recipe.id)}")`);
                categoryDuplicatesRemoved++;
                totalDuplicatesRemoved++;
              }
            }
            
            if (uniqueCategoryRecipes.length > 0) {
              deduplicatedRecipesByCategory.set(categoryName, uniqueCategoryRecipes);
              debugLogEmoji('📊', `Category "${categoryName}": ${uniqueCategoryRecipes.length} unique recipes after deduplication (${categoryDuplicatesRemoved} duplicates removed)`);
            } else {
              debugLogEmoji('⚠️', `Category "${categoryName}": No unique recipes remaining after deduplication (${categoryDuplicatesRemoved} duplicates removed)`);
            }
          }
          
          debugLogEmoji('🎯', `Deduplication complete: ${totalDuplicatesRemoved} total duplicates removed across all categories`);
          
          // Log recipe distribution summary
          debugLogEmoji('📋', 'Recipe distribution summary:');
          for (const [recipeId, categoryName] of recipeCategoryMapping.entries()) {
            const recipe = allRecipes.find(r => r.id === recipeId);
            if (recipe) {
              debugLogEmoji('  -', `Recipe "${recipe.name}" (${recipeId}) → Category: "${categoryName}"`);
            }
          }
          
          // Debug: Log what's being set in recipesByCategory
          debugLogEmoji('🔍', 'Setting recipesByCategory with:', {
            categoryCount: deduplicatedRecipesByCategory.size,
            categories: Array.from(deduplicatedRecipesByCategory.keys()),
            totalRecipes: uniqueRecipes.length
          });
          
          // Debug: Log a sample of recipes from each category
          for (const [categoryName, recipes] of deduplicatedRecipesByCategory.entries()) {
            if (recipes.length > 0) {
              const sampleRecipe = recipes[0];
              debugLogEmoji('📋', `Sample recipe from "${categoryName}":`, {
                id: sampleRecipe.id,
                name: sampleRecipe.name,
                hasIngredients: sampleRecipe.ingredients.length > 0,
                hasInstructions: sampleRecipe.instructions.length > 0,
                ingredientCount: sampleRecipe.ingredients.length,
                instructionCount: sampleRecipe.instructions.length
              });
            }
          }
          
          setRecipes(uniqueRecipes);
          // Create a new Map instance to ensure React detects the state change
          const finalRecipesByCategory = new Map(deduplicatedRecipesByCategory);
          setRecipesByCategory(finalRecipesByCategory); // Update the state with organized recipes
          
          // If no recipes found, still clear loading state to prevent hanging
          if (uniqueRecipes.length === 0) {
            console.warn('⚠️ No recipes found from search results, showing empty state');
          }
        } else {
          console.warn('⚠️ No recommendations data received');
          setRecipes([]);
        }
      } else {
        console.error('❌ Failed to fetch recommendations:', res.status);
        setRecipes([]);
      }
    } catch (e) {
      console.error('Error getting recipes from recommendations:', e);
      setRecipes([]);
      setIsRefreshingRecipes(false);
    } finally {
      // Always clear loading state to prevent hanging
      setIsLoadingRecipes(false);
      setIsRefreshingRecipes(false);
      console.log('✅ Recipe loading process completed');
    }
  }

  // Helper function to get search results from cache
  function getFromSearchCache(query) {
    return searchCache.get(query.toLowerCase());
  }

  // Helper function to add search results to cache
  function addToSearchCache(query, results) {
    setSearchCache(prevCache => {
      const newCache = new Map(prevCache);
      newCache.set(query.toLowerCase(), results);
      return newCache;
    });
  }

  // Helper function to clear search cache (useful for fresh data)
  function clearSearchCache() {
    setSearchCache(new Map());
  }



  async function checkClipperHealth() {
    try {
      setClipperStatus('checking');
      
      const res = await fetch(`${CLIPPER_API_URL}/health`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (res.ok) {
        const health = await res.json();
        setClipperStatus('available');
      } else {
        console.warn('Clipper worker health check failed:', res.status);
        setClipperStatus('unavailable');
      }
    } catch (e) {
      console.error('Error checking clipper worker health:', e);
      setClipperStatus('unavailable');
    }
  }

  async function addRecipe() {
    if (!name) return;
    
    // For manual recipe entry, we need to create a unique URL to use as the recipe ID
    // We'll use a timestamp-based approach since this is a manual entry
    const timestamp = Date.now();
    const manualRecipeUrl = `manual://${timestamp}`;
    
    const recipe = {
      title: name,
      description: description || '',
      ingredients: ingredients.filter(i => i.trim()),
      instructions: instructions.filter(i => i.trim()),
      prepTime: prepTime || '',
      cookTime: cookTime || '',
      recipeYield: recipeYield || null,
      url: manualRecipeUrl,
      imageUrl: ''
    };
    
    try {
      // Use the recipe-save-worker to save the recipe
      const response = await fetch(`${SAVE_WORKER_URL}/recipe/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ recipe })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save recipe: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Handle image upload if there's an image
        if (selectedImage) {
          await uploadRecipeImage(result.id, selectedImage);
        }
        
        // Refresh the recipe list
        setIsLoadingRecipes(true); // Show loading state
        await getRecipesFromRecommendations();
        clearSearchCache(); // Clear search cache to include the new recipe
        resetForm();
        
        // Show success message
        alert('Recipe added successfully!');
      } else {
        throw new Error(result.error || 'Failed to save recipe');
      }
    } catch (e) {
      console.error('Error adding recipe:', e);
      alert('Error saving recipe. Please try again.');
    }
  }

  async function updateRecipe() {
    if (!editingRecipe || !editableRecipe || !editableRecipe.name.trim()) return;
    
    try {
      // Prepare the update data
      const updates = {
        title: editableRecipe.name,
        description: editableRecipe.description,
        ingredients: editableRecipe.recipeIngredient || editableRecipe.ingredients || [],
        instructions: editableRecipe.recipeInstructions || editableRecipe.instructions || [],
        prepTime: editableRecipe.prepTime,
        cookTime: editableRecipe.cookTime,
        recipeYield: editableRecipe.recipeYield || editableRecipe.servings
      };
      
      // Use the recipe-save-worker to update the recipe
      const response = await fetch(`${SAVE_WORKER_URL}/recipe/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          recipeId: editingRecipe.id,
          updates 
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update recipe: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Refresh the recipe list
        setIsLoadingRecipes(true); // Show loading state
        await getRecipesFromRecommendations();
        clearSearchCache(); // Clear search cache to include the updated recipe
        resetForm();
        setEditingRecipe(null);
        setEditableRecipe(null);
        setIsEditingRecipe(false);
        
        // Show success message
        alert('Recipe updated successfully!');
      } else {
        throw new Error(result.error || 'Failed to update recipe');
      }
    } catch (e) {
      console.error('Error updating recipe:', e);
      alert('Error updating recipe. Please try again.');
    }
  }

  async function deleteRecipe(id) {
    if (!confirm('Are you sure you want to delete this recipe?')) return;
    try {
      // Use the recipe-save-worker to delete the recipe
      const response = await fetch(`${SAVE_WORKER_URL}/recipe/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ recipeId: id })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete recipe: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setIsLoadingRecipes(true); // Show loading state
        await getRecipesFromRecommendations();
        clearSearchCache(); // Clear search cache to remove the deleted recipe
        // Close any open modals/panels if this was the selected recipe
        if (selectedRecipe && selectedRecipe.id === id) {
          setSelectedRecipe(null);
          setShowSharePanel(false);
        }
      } else {
        throw new Error(result.error || 'Failed to delete recipe');
      }
    } catch (e) {
      console.error('Error deleting recipe:', e);
      alert('Error deleting recipe. Please try again.');
    }
  }





  async function handleSearchBarClip() {
    if (!isValidUrl(searchInput) || clipperStatus !== 'available') return;
    
    setIsSearchBarClipping(true);
    setSearchBarClipError(false);
    
    try {
      const res = await fetch(`${CLIPPER_API_URL}/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: searchInput }),
      });
      
      if (res.ok) {
        const result = await res.json();
        setClippedRecipePreview(result);
        setSearchInput(''); // Clear search input on success
        setIsSearchBarClipping(false);
        setSearchBarClipError(false);
      } else {
        console.error('Search bar clip failed:', res.status);
        setSearchBarClipError(true);
        
        // Keep error state for 3 seconds then reset
        setTimeout(() => {
          setSearchBarClipError(false);
          setIsSearchBarClipping(false);
        }, 3000);
      }
    } catch (e) {
      console.error('Error clipping from search bar:', e);
      setSearchBarClipError(true);
      
      // Keep error state for 3 seconds then reset
      setTimeout(() => {
        setSearchBarClipError(false);
        setIsSearchBarClipping(false);
      }, 3000);
    }
  }

  function editRecipe(recipe) {
    setEditingRecipe(recipe);
    // Handle both old and new schema field names
    const recipeIngredients = recipe.recipeIngredient || recipe.ingredients || [];
    const recipeInstructions = recipe.recipeInstructions || recipe.instructions || [];
    
    // Handle instructions that might be objects with text property
    const processedInstructions = Array.isArray(recipeInstructions) 
      ? recipeInstructions.map(inst => typeof inst === 'string' ? inst : inst.text || '')
      : [];
    
    setEditableRecipe({
      name: recipe.name,
      description: recipe.description || '',
      ingredients: Array.isArray(recipeIngredients) ? [...recipeIngredients] : [],
      instructions: processedInstructions,
      image: recipe.image || recipe.image_url || '',
      prep_time: recipe.prep_time || recipe.prepTime,
      cook_time: recipe.cook_time || recipe.cookTime,
      recipe_yield: recipe.recipe_yield || recipe.recipeYield || recipe.yield
    });
    setIsEditingRecipe(true);
    setSelectedImage(null);
  }

  function resetForm() {
    setName('');
    setDescription('');
    setIngredients([]);
    setInstructions([]);
    setPrepTime('');
    setCookTime('');
    setRecipeYield('');
    setSelectedImage(null);
    setEditingRecipe(null);
    setEditableRecipe(null);
    setIsEditingRecipe(false);
    setShowAddForm(false);
  }

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
    } else {
      alert('Please select a valid image file');
    }
  }

  function editPreview() {
    setEditablePreview({
      name: clippedRecipePreview.name,
      description: clippedRecipePreview.description || '',
      ingredients: [...(clippedRecipePreview.ingredients || clippedRecipePreview.recipeIngredient || [])],
      instructions: [...(clippedRecipePreview.instructions || (clippedRecipePreview.recipeInstructions || []).map(inst => 
        typeof inst === 'string' ? inst : inst.text
      ))],
      image_url: clippedRecipePreview.image_url || clippedRecipePreview.image,
      source_url: clippedRecipePreview.source_url
    });
    setIsEditingPreview(true);
  }

  function updatePreview() {
    if (!editablePreview || !editablePreview.name.trim()) {
      // Revert empty name to previous value to avoid leaving an empty field
      setEditablePreview(prev => ({
        ...prev,
        name: (clippedRecipePreview && clippedRecipePreview.name) || ''
      }));
      return;
    }
    
    setClippedRecipePreview({
      ...clippedRecipePreview,
      name: editablePreview.name.trim(),
      description: editablePreview.description.trim(),
      // Maintain both old and new schema fields
      ingredients: editablePreview.ingredients.filter(i => i.trim()),
      instructions: editablePreview.instructions.filter(i => i.trim()),
      recipeIngredient: editablePreview.ingredients.filter(i => i.trim()),
      recipeInstructions: editablePreview.instructions.filter(i => i.trim()).map(instruction => ({
        "@type": "HowToStep",
        text: instruction
      })),
      // Preserve the source_url
      source_url: clippedRecipePreview.source_url
    });
    setIsEditingPreview(false);
    setEditablePreview(null);
  }

  function cancelEditPreview() {
    setIsEditingPreview(false);
    setEditablePreview(null);
  }

  function openRecipeView(recipe) {
    setSelectedRecipe(recipe);
  }

  function openVideoPopup(videoUrl) {
    setCurrentVideoUrl(videoUrl);
    setShowVideoPopup(true);
  }

  async function saveRecipeToDatabase() {
    try {
      // Double-check that we're not already saving
      if (isSavingRecipe) {
        return;
      }
      
      // For clipped recipes, we need to use the recipe-save-worker instead of the scraper
      // This will save the recipe to the proper database
      const sourceUrl = clippedRecipePreview.source_url;
      if (!sourceUrl) {
        throw new Error('No source URL found for clipped recipe. Please try clipping the recipe again.');
      }
      
      // Prepare the recipe data for the save worker
      const recipeData = {
        title: clippedRecipePreview.name,
        description: clippedRecipePreview.description || '',
        ingredients: clippedRecipePreview.ingredients || clippedRecipePreview.recipeIngredient || [],
        instructions: clippedRecipePreview.instructions || (clippedRecipePreview.recipeInstructions || []).map(inst =>
          typeof inst === 'string' ? inst : inst.text || ''
        ),
        prepTime: clippedRecipePreview.prepTime || clippedRecipePreview.prep_time || '',
        cookTime: clippedRecipePreview.cookTime || clippedRecipePreview.cook_time || '',
        recipeYield: clippedRecipePreview.recipeYield || clippedRecipePreview.recipe_yield || clippedRecipePreview.yield || '',
        url: sourceUrl,
        imageUrl: clippedRecipePreview.image_url || clippedRecipePreview.image || ''
      };
      
      // Use the recipe-save-worker to save the clipped recipe
      const res = await fetch(`${SAVE_WORKER_URL}/recipe/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: recipeData })
      });
      
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setIsLoadingRecipes(true); // Show loading state
          await getRecipesFromRecommendations(); // Refresh the recipe list
          clearSearchCache(); // Clear search cache to include the new recipe
          setClippedRecipePreview(null);
          setClipError('');
          setIsEditingPreview(false);
          setEditablePreview(null);
          alert('Recipe saved successfully to database!');
        } else {
          throw new Error(result.error || 'Failed to save recipe');
        }
      } else {
        const errorText = await res.text();
        console.error('Failed to save recipe to database:', res.status, errorText);
        
        // Handle duplicate errors from backend
        if (errorText.includes('already exists') || errorText.includes('duplicate')) {
          // Recipe already exists - just proceed silently
          setIsLoadingRecipes(true); // Show loading state
          await getRecipesFromRecommendations(); // Refresh the recipe list
          clearSearchCache(); // Clear search cache to include the existing recipe
          setClippedRecipePreview(null);
          setClipError('');
          setIsEditingPreview(false);
          setEditablePreview(null);
        } else {
          throw new Error(`Failed to save recipe: ${errorText}`);
        }
      }
    } catch (error) {
      console.error('Error saving recipe:', error);
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        // Recipe already exists - just proceed silently
        setIsLoadingRecipes(true); // Show loading state
        await getRecipesFromRecommendations(); // Refresh the recipe list
        clearSearchCache(); // Clear search cache to include the existing recipe
        setClippedRecipePreview(null);
        setClipError('');
        setIsEditingPreview(false);
        setEditablePreview(null);
      } else {
        alert('Failed to save recipe. Please try again.');
      }
    }
  }

  function checkForDuplicates(recipeToCheck) {
    // Since we're now using recommendations, we'll do a lighter duplicate check
    // focusing on source URL which is more reliable for web recipes
    const duplicates = recipes.filter(recipe => {
      // Check for exact source URL match (most reliable)
      if (recipe.source_url === recipeToCheck.source_url) {
        return true;
      }
      
      // Check for exact name match (less reliable but still useful)
      if (recipe.name.toLowerCase() === recipeToCheck.name.toLowerCase()) {
        return true;
      }
      
      return false;
    });
    
    return duplicates;
  }

  function calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (str1.length === 0) return 0.0;
    if (str2.length === 0) return 0.0;
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  async function searchRecipes(query) {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    
    // Check cache first for instant results
    const cachedResults = getFromSearchCache(query);
    if (cachedResults) {
      debugLogEmoji('🚀', `Cache hit! Using cached search results for: "${query}" (${cachedResults.length} results)`);
      setSearchResults(cachedResults);
      setShowSearchResults(true);
      return;
    }
    
    debugLogEmoji('🔍', `Cache miss! Fetching fresh search results for: "${query}"`);
    
    setIsSearching(true);
    setShowSearchResults(true);
    
    try {
      const res = await fetch(`${SEARCH_DB_URL}/api/search?q=${encodeURIComponent(query)}&type=RECIPE&limit=20`);
      
      if (res.ok) {
        const result = await res.json();
        
        // Fetch complete recipe data from KV for each search result
        const completeResults = [];
        debugLogEmoji('🔄', `Fetching complete data for ${result.results.length} search results from KV...`);
        for (let i = 0; i < result.results.length; i++) {
          const node = result.results[i];
          debugLogEmoji('📥', `[${i + 1}/${result.results.length}] Fetching recipe ${node.id}...`);
          const completeRecipe = await fetchCompleteRecipeData(node.id);
          if (completeRecipe) {
            completeResults.push(completeRecipe);
            debugLogEmoji('✅', `[${i + 1}/${result.results.length}] Recipe ${node.id} fetched successfully`);
          } else {
            // Fallback to search result if KV fetch fails
            console.warn(`⚠️ [${i + 1}/${result.results.length}] KV fetch failed for recipe ${node.id}, using search result`);
            completeResults.push({ id: node.id, data: node.properties });
          }
        }
        debugLogEmoji('🎯', `Completed KV fetching: ${completeResults.length}/${result.results.length} recipes retrieved`);
        
        // Transform complete recipes to match the frontend format
        const transformedResults = completeResults.map(recipe => {
          // Handle both KV format and search result format
          const recipeData = recipe.data || recipe;
          return {
            id: recipe.id || recipeData.id,
            name: recipeData.name || recipeData.title || 'Untitled Recipe',
            description: recipeData.description || '',
            image: recipeData.image || recipeData.imageUrl || recipeData.image_url || '',
            image_url: recipeData.image || recipeData.imageUrl || recipeData.image_url || '',
            prep_time: recipeData.prepTime || recipeData.prep_time || null,
            cook_time: recipeData.cookTime || recipeData.cook_time || null,
            recipe_yield: recipeData.servings || recipeData.recipeYield || recipeData.recipe_yield || null,
            source_url: recipeData.url || recipeData.source_url || '',
            // Include full recipe data for when user selects a result
            ingredients: recipeData.ingredients || [],
            instructions: recipeData.instructions || [],
            recipeIngredient: recipeData.ingredients || [],
            recipeInstructions: recipeData.instructions || []
          };
        });
        
        // Cache the results for future use
        addToSearchCache(query, transformedResults);
        debugLogEmoji('💾', `Cached search results for: "${query}" (${transformedResults.length} results)`);
        setSearchResults(transformedResults);
      } else {
        console.error('Search failed:', res.status);
        setSearchResults([]);
      }
    } catch (e) {
      console.error('Error searching recipes:', e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }





  return (
    <>
      {/* Seasoning background canvas for both light and dark modes */}
      <canvas 
        ref={seasoningCanvasRef} 
        className="seasoning-background"
        style={{ 
          display: 'block',
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: -1,
          pointerEvents: 'none'
        }}
      />
      
      {/* Fixed header container */}
      <div className="header-container">
        <h1 className="title">
          <img src="/spoon.svg" alt="Seasoned" className="title-icon" />
          Seasoned
          {/* Search bar in the same panel */}
          <div className={`title-search ${isSearchBarClipping ? 'clipping' : ''} ${searchBarClipError ? 'clip-error' : ''}`}>
            <input 
              type="text" 
              className="title-search-input" 
              placeholder="Search recipes or paste a URL to clip..."
              aria-label="Search recipes"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                // Clear any existing timeout
                if (searchTimeoutRef.current) {
                  clearTimeout(searchTimeoutRef.current);
                }
                
                // Trigger search if not a URL
                if (!isValidUrl(e.target.value)) {
                  if (e.target.value.trim().length >= 2) {
                    // Debounce search with 300ms delay
                    searchTimeoutRef.current = setTimeout(() => {
                      searchRecipes(e.target.value);
                    }, 300);
                  } else {
                    // Clear results if query is too short
                    setSearchResults([]);
                    setShowSearchResults(false);
                  }
                } else {
                  // Clear search results if it's a URL
                  setSearchResults([]);
                  setShowSearchResults(false);
                }
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  if (isValidUrl(searchInput) && clipperStatus === 'available') {
                    handleSearchBarClip();
                  } else if (!isValidUrl(searchInput) && searchInput.trim()) {
                    // Trigger search for non-URL inputs
                    searchRecipes(searchInput);
                  } else if (!searchInput.trim()) {
                    // Only open clip dialog if input is empty
                    setIsClipping(true);
                  }
                }
              }}
              disabled={isSearchBarClipping || (isValidUrl(searchInput) && clipperStatus !== 'available')}
            />
            <button 
              className={`title-search-button ${isValidUrl(searchInput) && clipperStatus === 'available' ? 'clipper-available' : ''}`}
              aria-label={isValidUrl(searchInput) ? "Clip recipe" : "Search"}
              title={isValidUrl(searchInput) ? 
                (clipperStatus === 'available' ? "Clip recipe from website" : "Recipe clipper service is currently unavailable") : 
                "Search recipes"
              }
              onClick={() => {
                console.log('Button clicked, searchInput:', searchInput);
                console.log('isValidUrl result:', isValidUrl(searchInput));
                console.log('clipperStatus:', clipperStatus);
                if (isValidUrl(searchInput) && clipperStatus === 'available') {
                  handleSearchBarClip();
                } else if (!isValidUrl(searchInput) && searchInput.trim()) {
                  // Trigger search for non-URL inputs
                  searchRecipes(searchInput);
                } else if (!searchInput.trim()) {
                  // Only open clip dialog if input is empty
                  setIsClipping(true);
                }
              }}
              disabled={isSearchBarClipping || (isValidUrl(searchInput) && clipperStatus !== 'available')}
            >
              {isSearchBarClipping ? (
                <div className="loading-spinner">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                </div>
              ) : isValidUrl(searchInput) ? (
                <img 
                  src="/scissor.svg" 
                  alt="Clip" 
                  style={{ 
                    width: '18px', 
                    height: '18px',
                    opacity: clipperStatus === 'available' ? 1 : 0.3
                  }} 
                  className={clipperStatus === 'available' ? 'clip-icon-available' : 'clip-icon'}
                />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
              )}
            </button>
          </div>
          {/* Desktop Add button - outside search panel, to the right */}
          {/* TODO: Enable with feature flag */}
          {/* <button className="fab fab-add fab-desktop" onClick={() => setShowAddForm(true)}>
            <span className="fab-icon">+</span>
          </button> */}
        </h1>
        
        {/* Search Results Dropdown - now inside the header container */}
        {showSearchResults && (
          <div className="search-results-dropdown">
            {isSearching ? (
              <div className="search-loading">
                <div className="loading-spinner">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                </div>
                <span>Searching recipes...</span>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="search-results-list">
                {searchResults.map((recipe) => (
                  <div 
                    key={recipe.id} 
                    className="search-result-item"
                    onClick={() => {
                      // Clear search
                      setSearchInput('');
                      setSearchResults([]);
                      setShowSearchResults(false);
                    }}
                  >
                    <div className="search-result-title">{recipe.name}</div>
                    <div className="search-result-meta">
                      {recipe.prep_time && (
                        <span className="search-meta-item">
                          <span className="meta-label">Prep:</span> {formatDuration(recipe.prep_time)}
                        </span>
                      )}
                      {recipe.cook_time && (
                        <span className="search-meta-item">
                          <span className="meta-label">Cook:</span> {formatDuration(recipe.cook_time)}
                        </span>
                      )}
                      {recipe.recipe_yield && (
                        <span className="search-meta-item">
                          <span className="meta-label">Yield:</span> {recipe.recipe_yield}
                        </span>
                      )}
                      {!recipe.prep_time && !recipe.cook_time && !recipe.recipe_yield && (
                        <span className="search-meta-item no-meta">No timing information</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="search-no-results">
                No recipes found for "{searchInput}"
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Mobile FAB - outside header, bottom left */}
      {/* TODO: Enable with feature flag */}
      {/* <button className="fab fab-add fab-mobile" onClick={() => setShowAddForm(true)}>
        <span className="fab-icon">+</span>
      </button> */}

      {/* Main container - scrollable content */}
      <div className={`container ${selectedRecipe ? 'recipe-view-active' : ''}`}>
        <div className="recipes-list">
        {/* Show recipe cards unless recipe is selected */}
        {!selectedRecipe && (
          <>
            {/* Show loading cards while recipes are loading */}
            {isLoadingRecipes && (
              <div className="loading-recommendations">
                {/* Show green loading bar initially, then cached categories when available */}
                {cachedCategoryNames.length > 0 ? (
                  // Use cached category names for instant display
                  cachedCategoryNames.map((categoryName, categoryIndex) => (
                    <div key={categoryName} className="recommendation-category">
                      <h2 className="category-title">{categoryName}</h2>
                      <SwipeableRecipeGrid>
                        {[1, 2, 3].map(index => (
                          <div key={index} className="recipe-card loading-card">
                            <div className="recipe-card-image loading-pulse">
                              <div className="loading-shimmer"></div>
                            </div>
                            <div className="recipe-card-content">
                              <div className="loading-text loading-pulse"></div>
                              <div className="loading-text loading-pulse" style={{ width: '60%' }}></div>
                            </div>
                          </div>
                        ))}
                      </SwipeableRecipeGrid>
                    </div>
                  ))
                ) : (
                  // Show green loading bar when no cached categories
                  <div className="loading-bar-container">
                    <div className="loading-bar"></div>
                  </div>
                )}
              </div>
            )}
            
            {/* Show recommendations when loaded */}
            {!isLoadingRecipes && (
              <>
                {recipes.length > 0 ? (
                  <Recommendations 
                    onRecipeSelect={openRecipeView} 
                    recipesByCategory={recipesByCategory}
                  />
                ) : (
                  <div className="no-recipes-found">
                    <div className="no-recipes-content">
                      <h2>No Recipes Found</h2>
                      <p>We couldn't load any recipes at the moment. This might be due to:</p>
                      <ul>
                        <li>Network connectivity issues</li>
                        <li>Search service temporarily unavailable</li>
                        <li>No recipes matching current recommendations</li>
                      </ul>
                      <button 
                        className="retry-button"
                        onClick={() => {
                          setIsLoadingRecipes(true);
                          getRecipesFromRecommendations();
                        }}
                      >
                        🔄 Try Again
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Show Add Recipe Form when active */}
        {showAddForm && (
          <div className="overlay">
            <div className="overlay-content">
              <div className="form-panel glass">
                <div className="form-panel-header">
                  <h2>{editingRecipe ? 'Edit Recipe' : 'Add New Recipe'}</h2>
                  <button className="close-btn" onClick={() => {
                    setShowAddForm(false);
                    resetForm();
                  }}>×</button>
                </div>
                <div className="form-panel-content">
                  {editingRecipe && isEditingRecipe && editableRecipe ? (
                    // Edit Mode - matching clip edit format
                    <>
                      <div className="recipe-preview-content">
                        <div className="recipe-preview-section">
                          <h4>Recipe Name</h4>
                          <input 
                            type="text" 
                            value={editableRecipe.name} 
                            onChange={e => setEditableRecipe({...editableRecipe, name: e.target.value})}
                            className="preview-edit-input"
                          />
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Description</h4>
                          <textarea 
                            value={editableRecipe.description} 
                            onChange={e => setEditableRecipe({...editableRecipe, description: e.target.value})}
                            className="preview-edit-textarea"
                            placeholder="Recipe description..."
                          />
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Ingredients</h4>
                          <div className="ingredients-edit-container">
                            {editableRecipe.ingredients.map((ingredient, index) => (
                              <div key={index} className="ingredient-edit-row">
                                <input 
                                  type="text" 
                                  value={ingredient} 
                                  onChange={e => {
                                    const newIngredients = [...editableRecipe.ingredients];
                                    newIngredients[index] = e.target.value;
                                    setEditableRecipe({...editableRecipe, ingredients: newIngredients});
                                  }}
                                  className="preview-edit-input ingredient-input"
                                />
                                <button 
                                  onClick={() => {
                                    const newIngredients = editableRecipe.ingredients.filter((_, i) => i !== index);
                                    setEditableRecipe({...editableRecipe, ingredients: newIngredients});
                                  }}
                                  className="remove-ingredient-btn"
                                  title="Remove ingredient"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            <button 
                              onClick={() => {
                                setEditableRecipe({
                                  ...editableRecipe, 
                                  ingredients: [...editableRecipe.ingredients, '']
                                });
                              }}
                              className="add-ingredient-btn"
                            >
                              + Add Ingredient
                            </button>
                          </div>
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Instructions</h4>
                          <div className="instructions-edit-container">
                            {editableRecipe.instructions.map((instruction, index) => (
                              <div key={index} className="instruction-edit-row">
                                <textarea 
                                  value={instruction} 
                                  onChange={e => {
                                    const newInstructions = [...editableRecipe.instructions];
                                    newInstructions[index] = e.target.value;
                                    setEditableRecipe({...editableRecipe, instructions: newInstructions});
                                  }}
                                  className="preview-edit-textarea instruction-textarea"
                                  placeholder={`Step ${index + 1}`}
                                />
                                <button 
                                  onClick={() => {
                                    const newInstructions = editableRecipe.instructions.filter((_, i) => i !== index);
                                    setEditableRecipe({...editableRecipe, instructions: newInstructions});
                                  }}
                                  className="remove-instruction-btn"
                                  title="Remove instruction"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            <button 
                              onClick={() => {
                                setEditableRecipe({
                                  ...editableRecipe, 
                                  instructions: [...editableRecipe.instructions, '']
                                });
                              }}
                              className="add-instruction-btn"
                            >
                              + Add Instruction
                            </button>
                          </div>
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Prep Time (minutes)</h4>
                          <input 
                            type="number" 
                            value={editableRecipe.prep_time || ''} 
                            onChange={e => setEditableRecipe({...editableRecipe, prep_time: e.target.value ? parseInt(e.target.value) : null})}
                            className="preview-edit-input"
                            placeholder="Prep time in minutes"
                            min="0"
                          />
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Cook Time (minutes)</h4>
                          <input 
                            type="number" 
                            value={editableRecipe.cook_time || ''} 
                            onChange={e => setEditableRecipe({...editableRecipe, cook_time: e.target.value ? parseInt(e.target.value) : null})}
                            className="preview-edit-input"
                            placeholder="Cook time in minutes"
                            min="0"
                          />
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Yield</h4>
                          <input 
                            type="text" 
                            value={editableRecipe.recipe_yield || ''} 
                            onChange={e => setEditableRecipe({...editableRecipe, recipe_yield: e.target.value})}
                            className="preview-edit-input"
                            placeholder="e.g., 4 servings, 1 loaf"
                          />
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Recipe Image</h4>
                          <div className="image-upload">
                            <label htmlFor="image-input" className="image-upload-label">
                              {selectedImage ? selectedImage.name : 'Choose New Image (Optional)'}
                            </label>
                            <input
                              id="image-input"
                              type="file"
                              accept="image/*"
                              onChange={handleImageChange}
                              style={{ display: 'none' }}
                            />
                          </div>
                          {editableRecipe.image && (
                            <img 
                              src={editableRecipe.image} 
                              alt={editableRecipe.name}
                              className="preview-image"
                              style={{ marginTop: '10px', maxWidth: '200px' }}
                            />
                          )}
                        </div>
                      </div>
                      
                      <div className="form-actions">
                        <button onClick={updateRecipe} className="update-btn">
                          ✓ Update Recipe
                        </button>
                        <button onClick={resetForm} className="cancel-btn">
                          Cancel Edit
                        </button>
                      </div>
                    </>
                  ) : (
                    // Add Mode - updated to match edit panel format
                    <>
                      <div className="recipe-preview-content">
                        <div className="recipe-preview-section">
                          <h4>Recipe Name</h4>
                          <input 
                            type="text" 
                            value={name} 
                            onChange={e => setName(e.target.value)}
                            className="preview-edit-input"
                            placeholder="Enter recipe name"
                          />
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Description</h4>
                          <textarea 
                            value={description} 
                            onChange={e => setDescription(e.target.value)}
                            className="preview-edit-textarea"
                            placeholder="Recipe description..."
                          />
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Ingredients</h4>
                          <div className="ingredients-edit-container">
                            {ingredients.map((ingredient, index) => (
                              <div key={index} className="ingredient-edit-row">
                                <input 
                                  type="text" 
                                  value={ingredient} 
                                  onChange={e => {
                                    const newIngredients = [...ingredients];
                                    newIngredients[index] = e.target.value;
                                    setIngredients(newIngredients);
                                  }}
                                  className="preview-edit-input ingredient-input"
                                />
                                <button 
                                  onClick={() => {
                                    const newIngredients = ingredients.filter((_, i) => i !== index);
                                    setIngredients(newIngredients);
                                  }}
                                  className="remove-ingredient-btn"
                                  title="Remove ingredient"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {ingredients.length === 0 && (
                              <div className="ingredient-edit-row">
                                <input 
                                  type="text" 
                                  value="" 
                                  onChange={e => setIngredients([e.target.value])}
                                  className="preview-edit-input ingredient-input"
                                  placeholder="Add first ingredient"
                                />
                              </div>
                            )}
                            <button 
                              onClick={() => {
                                setIngredients([...ingredients, '']);
                              }}
                              className="add-ingredient-btn"
                            >
                              + Add Ingredient
                            </button>
                          </div>
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Instructions</h4>
                          <div className="instructions-edit-container">
                            {instructions.map((instruction, index) => (
                              <div key={index} className="instruction-edit-row">
                                <textarea 
                                  value={instruction} 
                                  onChange={e => {
                                    const newInstructions = [...instructions];
                                    newInstructions[index] = e.target.value;
                                    setInstructions(newInstructions);
                                  }}
                                  className="preview-edit-textarea instruction-textarea"
                                  placeholder={`Step ${index + 1}`}
                                />
                                <button 
                                  onClick={() => {
                                    const newInstructions = instructions.filter((_, i) => i !== index);
                                    setInstructions(newInstructions);
                                  }}
                                  className="remove-instruction-btn"
                                  title="Remove instruction"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {instructions.length === 0 && (
                              <div className="instruction-edit-row">
                                <textarea 
                                  value="" 
                                  onChange={e => setInstructions([e.target.value])}
                                  className="preview-edit-textarea instruction-textarea"
                                  placeholder="Step 1"
                                />
                              </div>
                            )}
                            <button 
                              onClick={() => {
                                setInstructions([...instructions, '']);
                              }}
                              className="add-instruction-btn"
                            >
                              + Add Instruction
                            </button>
                          </div>
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Prep Time (minutes)</h4>
                          <input 
                            type="number" 
                            value={prepTime} 
                            onChange={e => setPrepTime(e.target.value)}
                            className="preview-edit-input"
                            placeholder="Prep time in minutes"
                            min="0"
                          />
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Cook Time (minutes)</h4>
                          <input 
                            type="number" 
                            value={cookTime} 
                            onChange={e => setCookTime(e.target.value)}
                            className="preview-edit-input"
                            placeholder="Cook time in minutes"
                            min="0"
                          />
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Yield</h4>
                          <input 
                            type="text" 
                            value={recipeYield} 
                            onChange={e => setRecipeYield(e.target.value)}
                            className="preview-edit-input"
                            placeholder="e.g., 4 servings, 1 loaf"
                          />
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Recipe Image</h4>
                          <div className="image-upload">
                            <label htmlFor="image-input-add" className="image-upload-label">
                              {selectedImage ? selectedImage.name : 'Choose Image (Optional)'}
                            </label>
                            <input
                              id="image-input-add"
                              type="file"
                              accept="image/*"
                              onChange={handleImageChange}
                              style={{ display: 'none' }}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="form-actions">
                        <button onClick={addRecipe} className="add-btn">
                          + Add Recipe
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Show Clipped Recipe Preview when active */}
        {clippedRecipePreview && (
          <div className="overlay">
            <div className="overlay-content recipe-preview-overlay">
              <div className="form-panel glass recipe-preview-panel">
                {/* Save Progress Overlay */}
                {isSavingRecipe && (
                  <div className="save-progress-overlay">
                    <div className="save-progress-content">
                      <div className="save-spinner">🔄</div>
                      <p>Saving recipe...</p>
                      <p className="save-note">Please don't close this window</p>
                    </div>
                  </div>
                )}
                
                {/* Hero Image that extends under header */}
                {!isEditingPreview && (clippedRecipePreview.image || clippedRecipePreview.image_url) && (
                  <div className="recipe-preview-image-hero-full">
                    <img 
                      src={clippedRecipePreview.image || clippedRecipePreview.image_url} 
                      alt={clippedRecipePreview.name}
                      className="preview-hero-image"
                    />
                    <div className="recipe-preview-hero-gradient"></div>
                  </div>
                )}
                
                <div className="form-panel-header">
                  <h2>Clipped Recipe Preview</h2>
                  <button 
                    className="close-btn" 
                    onClick={() => {
                      if (!isSavingRecipe) {
                        setClippedRecipePreview(null);
                        setClipUrl('');
                        setClipError('');
                        setIsEditingPreview(false);
                        setEditablePreview(null);
                      }
                    }}
                    disabled={isSavingRecipe}
                  >×</button>
                </div>
                
                <div className="form-panel-content">
                  {!isEditingPreview ? (
                    // Preview Mode
                    <>
                      <div className="recipe-preview-content">
                        {/* Title and description - always shown */}
                        <div className="recipe-preview-header-section">
                          <h3 className="recipe-preview-title">{clippedRecipePreview.name}</h3>
                          {clippedRecipePreview.description && (
                            <p className="recipe-preview-description">{clippedRecipePreview.description}</p>
                          )}
                        </div>
                        
                        <div className="recipe-preview-sections">
                          <div className="recipe-preview-section">
                            <h4>Ingredients ({(clippedRecipePreview.recipeIngredient || clippedRecipePreview.ingredients || []).length})</h4>
                            <ul className="recipe-preview-ingredients">
                              {(clippedRecipePreview.recipeIngredient || clippedRecipePreview.ingredients || []).map((ingredient, index) => (
                                <li key={index}>{ingredient}</li>
                              ))}
                            </ul>
                          </div>
                          
                          <div className="recipe-preview-section">
                            <h4>Instructions ({(clippedRecipePreview.recipeInstructions || clippedRecipePreview.instructions || []).length})</h4>
                            <ol className="recipe-preview-instructions">
                              {(clippedRecipePreview.recipeInstructions || clippedRecipePreview.instructions || []).map((instruction, index) => (
                                <li key={index}>
                                  {typeof instruction === 'string' ? instruction : instruction.text || ''}
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                        
                        <div className="recipe-preview-source">
                          <h4>Source</h4>
                          <p><a href={clippedRecipePreview.source_url} target="_blank" rel="noopener noreferrer" className="source-link">{clippedRecipePreview.source_url}</a></p>
                        </div>
                      </div>
                      
                      <div className="form-actions">
                        {/* TODO: Enable with feature flag */}
                        {/* <button onClick={editPreview} className="edit-btn" disabled={isSavingRecipe}>
                          ✏️ Edit Recipe
                        </button> */}
                        <button 
                          onClick={async () => {
                            // Prevent rapid successive saves (debounce)
                            const now = Date.now();
                            if (now - lastSaveTime < 2000) { // 2 second debounce
                              alert('Please wait a moment before trying to save again.');
                              return;
                            }
                            
                            if (isSavingRecipe) return; // Prevent double saves
                            setIsSavingRecipe(true);
                            setLastSaveTime(now);
                            
                            try {
                              // Check if recipe with same name and source already exists
                              const duplicates = checkForDuplicates(clippedRecipePreview);
                              
                              if (duplicates.length > 0) {
                                const duplicateNames = duplicates.map(d => d.name).join(', ');
                                if (confirm(`Potential duplicate detected:\n\n${duplicateNames}\n\nDo you want to save this recipe anyway?`)) {
                                  await saveRecipeToDatabase();
                                }
                              } else {
                                await saveRecipeToDatabase();
                              }
                            } catch (error) {
                              console.error('Error saving recipe:', error);
                              alert('Failed to save recipe. Please try again.');
                            } finally {
                              setIsSavingRecipe(false);
                            }
                          }} 
                          className="add-btn"
                          disabled={isSavingRecipe}
                        >
                          {isSavingRecipe ? '🔄 Saving...' : 'Save Recipe'}
                        </button>

                        <button 
                          onClick={() => {
                            if (!isSavingRecipe) {
                              setClippedRecipePreview(null);
                              setClipError('');
                              setIsEditingPreview(false);
                              setEditablePreview(null);
                            }
                          }} 
                          className="cancel-btn"
                          disabled={isSavingRecipe}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    // Edit Mode
                    <>
                      <div className="recipe-preview-content">
                        <div className="recipe-preview-section">
                          <h4>Recipe Name</h4>
                          <input 
                            type="text" 
                            value={editablePreview.name} 
                            onChange={e => setEditablePreview({...editablePreview, name: e.target.value})}
                            className="preview-edit-input"
                          />
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Description</h4>
                          <textarea 
                            value={editablePreview.description} 
                            onChange={e => setEditablePreview({...editablePreview, description: e.target.value})}
                            className="preview-edit-textarea"
                            placeholder="Recipe description..."
                          />
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Ingredients</h4>
                          <div className="ingredients-edit-container">
                            {editablePreview.ingredients.map((ingredient, index) => (
                              <div key={index} className="ingredient-edit-row">
                                <input 
                                  type="text" 
                                  value={ingredient} 
                                  onChange={e => {
                                    const newIngredients = [...editablePreview.ingredients];
                                    newIngredients[index] = e.target.value;
                                    setEditablePreview({...editablePreview, ingredients: newIngredients});
                                  }}
                                  className="preview-edit-input ingredient-input"
                                />
                                <button 
                                  onClick={() => {
                                    const newIngredients = editablePreview.ingredients.filter((_, i) => i !== index);
                                    setEditablePreview({...editablePreview, ingredients: newIngredients});
                                  }}
                                  className="remove-ingredient-btn"
                                  title="Remove ingredient"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            <button 
                              onClick={() => {
                                setEditablePreview({
                                  ...editablePreview, 
                                  ingredients: [...editablePreview.ingredients, '']
                                });
                              }}
                              className="add-ingredient-btn"
                            >
                              + Add Ingredient
                            </button>
                          </div>
                        </div>
                        
                        <div className="recipe-preview-section">
                          <h4>Instructions</h4>
                          <div className="instructions-edit-container">
                            {editablePreview.instructions.map((instruction, index) => (
                              <div key={index} className="instruction-edit-row">
                                <textarea 
                                  value={instruction} 
                                  onChange={e => {
                                    const newInstructions = [...editablePreview.instructions];
                                    newInstructions[index] = e.target.value;
                                    setEditablePreview({...editablePreview, instructions: newInstructions});
                                  }}
                                  className="preview-edit-textarea instruction-textarea"
                                  placeholder={`Step ${index + 1}`}
                                />
                                <button 
                                  onClick={() => {
                                    const newInstructions = editablePreview.instructions.filter((_, i) => i !== index);
                                    setEditablePreview({...editablePreview, instructions: newInstructions});
                                  }}
                                  className="remove-instruction-btn"
                                  title="Remove instruction"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            <button 
                              onClick={() => {
                                setEditablePreview({
                                  ...editablePreview, 
                                  instructions: [...editablePreview.instructions, '']
                                });
                              }}
                              className="add-instruction-btn"
                            >
                              + Add Instruction
                            </button>
                          </div>
                        </div>
                        
                        {clippedRecipePreview.image_url && (
                          <div className="recipe-preview-image">
                            <h4>Recipe Image</h4>
                            <img 
                              src={clippedRecipePreview.image_url} 
                              alt={clippedRecipePreview.name}
                              className="preview-image"
                            />
                          </div>
                        )}
                        
                        <div className="recipe-preview-source">
                          <h4>Source</h4>
                          <p><a href={clippedRecipePreview.source_url} target="_blank" rel="noopener noreferrer" className="source-link">{clippedRecipePreview.source_url}</a></p>
                        </div>
                      </div>
                      
                      <div className="form-actions">
                        <button onClick={updatePreview} className="update-btn" disabled={isSavingRecipe}>
                          ✓ Update Preview
                        </button>
                        <button onClick={cancelEditPreview} className="cancel-btn" disabled={isSavingRecipe}>
                          Cancel Edit
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Show Clip Recipe Form when active */}
        {isClipping && !clippedRecipePreview && (
          <div className="overlay">
            <div className="overlay-content">
              <div className="form-panel glass">
                <div className="form-panel-header">
                  <h2>Clip Recipe from Website</h2>
                  <button 
                    className="close-btn" 
                    onClick={() => {
                      setIsClipping(false);
                      setClipError('');
                    }}
                    title="Close"
                  >×</button>
                </div>
                <div className="form-panel-content">
                  <div className="recipe-preview-section">
                    <h4>Recipe URL</h4>
                    <input
                      type="text"
                      placeholder="Recipe URL"
                      value={clipUrl}
                      onChange={e => setClipUrl(e.target.value)}
                      className="preview-edit-input"
                    />
                  </div>
                  {clipError && (
                    <p className="error-message">{clipError}</p>
                  )}
                  <div className="form-actions">
                    <button 
                      onClick={async () => {
                        if (!isValidUrl(clipUrl)) return;
                        try {
                          setIsClipping(true);
                          const res = await fetch(`${CLIPPER_API_URL}/clip`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: clipUrl })
                          });
                          if (!res.ok) {
                            if (res.status === 404) {
                              setClipError('No recipe found on this page');
                            } else {
                              const msg = await res.text();
                              setClipError(msg || 'Failed to clip recipe');
                            }
                            return;
                          }
                          const result = await res.json();
                          setClippedRecipePreview(result);
                          setClipError('');
                        } catch (e) {
                          setClipError('Failed to clip recipe. Please try again.');
                        } finally {
                          // Keep panel open until preview shows
                        }
                      }}
                      className="add-btn"
                      aria-label="Submit Clip Recipe"
                    >
                      Clip Recipe
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full Screen Recipe View */}
      {selectedRecipe && (
        <div className="recipe-fullscreen" ref={recipeFullscreenRef}>
          {/* Top Header with Back Button and Action Buttons */}
          <div className="recipe-top-header">
            <button className="back-btn" onClick={() => {
              setSelectedRecipe(null);
              setShowSharePanel(false); // Reset share panel when closing recipe view
              setShowNutrition(false); // Reset nutrition view when closing
            }}>
              <span className="back-arrow">←</span>
            </button>
            
            {/* Nutrition FAB - only show if nutrition data exists */}
            {selectedRecipe.nutrition && Object.keys(selectedRecipe.nutrition).length > 0 && (
              <button 
                className="fab-nutrition-trigger"
                onClick={() => setShowNutrition(!showNutrition)}
                title={showNutrition ? "Show ingredients and instructions" : "Show nutrition information"}
              >
                <img 
                  src="/nutrition-label.png" 
                  alt="Nutrition" 
                  className="nutrition-icon"
                  width="24"
                  height="24"
                />
              </button>
            )}
            
            {/* Share/More Actions FAB */}
            <button 
              className="fab-share-trigger"
              onClick={() => setShowSharePanel(!showSharePanel)}
              title="More actions"
            >
              <span className="share-icon">⋮</span>
            </button>
          </div>
          
          {/* Share Panel */}
          <div className={`share-panel ${showSharePanel ? 'visible' : ''}`}>
            {/* TODO: Enable with feature flag */}
            {/* <button 
              className="share-panel-item edit-action"
              onClick={() => {
                editRecipe(selectedRecipe);
                setShowAddForm(true);
                setShowSharePanel(false);
              }}
            >
              <span className="action-icon">✏️</span>
              <span className="action-label">Edit Recipe</span>
            </button> */}
            
            <button 
              className="share-panel-item delete-action"
              onClick={() => {
                if (confirm('Are you sure you want to delete this recipe?')) {
                  deleteRecipe(selectedRecipe.id);
                  setSelectedRecipe(null);
                  setShowSharePanel(false);
                }
              }}
            >
              <span className="action-icon">🗑️</span>
              <span className="action-label">Delete Recipe</span>
            </button>
            
            <button 
              className="share-panel-item share-action"
              onClick={() => {
                // Share functionality - could be expanded later
                if (navigator.share && selectedRecipe.source_url) {
                  navigator.share({
                    title: selectedRecipe.name,
                    text: `Check out this recipe: ${selectedRecipe.name}`,
                    url: selectedRecipe.source_url
                  }).catch(() => {
                    // Fallback to copy link
                    navigator.clipboard.writeText(selectedRecipe.source_url);
                    alert('Recipe link copied to clipboard!');
                  });
                } else if (selectedRecipe.source_url) {
                  navigator.clipboard.writeText(selectedRecipe.source_url);
                  alert('Recipe link copied to clipboard!');
                }
                setShowSharePanel(false);
              }}
            >
              <span className="action-icon">🔗</span>
              <span className="action-label">Share Recipe</span>
            </button>
          </div>
          
          {/* Title Section - moved below header */}
          <div className="recipe-title-section" style={{ opacity: titleOpacity, transition: 'opacity 0.2s ease-out' }}>
            <h1 className="recipe-fullscreen-title">{selectedRecipe.name}</h1>
            
            {/* Recipe Timing Info - prep time, cook time, yield */}
            {(selectedRecipe.prep_time || selectedRecipe.prepTime || 
              selectedRecipe.cook_time || selectedRecipe.cookTime || 
              selectedRecipe.recipe_yield || selectedRecipe.recipeYield || selectedRecipe.yield) ? (
              <div className="recipe-card-time">
                <div className="time-item">
                  <span className="time-label">Prep</span>
                  <span className="time-value">{formatDuration(selectedRecipe.prep_time || selectedRecipe.prepTime) || '-'}</span>
                </div>
                <div className="time-divider"></div>
                <div className="time-item">
                  <span className="time-label">Cook</span>
                  <span className="time-value">{formatDuration(selectedRecipe.cook_time || selectedRecipe.cookTime) || '-'}</span>
                </div>
                {(selectedRecipe.recipe_yield || selectedRecipe.recipeYield || selectedRecipe.yield) && (
                  <>
                    <div className="time-divider"></div>
                    <div className="time-item">
                      <span className="time-label">Yield</span>
                      <span className="time-value">{selectedRecipe.recipe_yield || selectedRecipe.recipeYield || selectedRecipe.yield}</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="recipe-card-time">
                <span className="time-icon">⏱️</span>
                <span className="no-time">-</span>
              </p>
            )}
            
            {/* Recipe Links - under title */}
            {(selectedRecipe.source_url || selectedRecipe.video_url !== undefined || (selectedRecipe.video && selectedRecipe.video.contentUrl)) && (
              <div className="recipe-links">
                {selectedRecipe.source_url && (
                  <a 
                    href={selectedRecipe.source_url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="recipe-link source-link"
                    title="View original recipe"
                  >
                    🌐 Source Recipe
                  </a>
                )}
                {(() => {
                  const videoUrl = selectedRecipe.video_url || (selectedRecipe.video && selectedRecipe.video.contentUrl);
                  return videoUrl && isValidUrl(videoUrl) && (
                    <button 
                      className="recipe-link video-link"
                      title="Watch recipe video"
                      onClick={(e) => {
                        e.stopPropagation();
                        openVideoPopup(videoUrl);
                      }}
                    >
                      🎥 Watch Video
                    </button>
                  );
                })()}
              </div>
            )}
          </div>
          
          {/* Full Background Image */}
          <div className="recipe-full-background">
            {(selectedRecipe.image || selectedRecipe.image_url) ? (
              <img 
                src={selectedRecipe.image || selectedRecipe.image_url} 
                alt={selectedRecipe.name}
                className="recipe-full-background-image"
              />
            ) : (
              <div className="recipe-full-background-placeholder">
                <div className="placeholder-gradient"></div>
              </div>
            )}
          </div>
          
          {/* Recipe Content */}
          <div className={`recipe-fullscreen-content ${showNutrition ? 'nutrition-view' : ''}`}>
            {showNutrition ? (
              /* Nutrition Panel */
              <div className="nutrition-facts-label">
                <h2 className="nutrition-title">Nutrition Facts</h2>
                  {(selectedRecipe.recipe_yield || selectedRecipe.recipeYield || selectedRecipe.yield) && (
                    <div className="serving-info">
                      <span className="serving-label">Serving Size</span>
                      <span className="serving-value">1 serving</span>
                    </div>
                  )}
                  {(selectedRecipe.recipe_yield || selectedRecipe.recipeYield || selectedRecipe.yield) && (
                    <div className="servings-per-container">
                      <span className="serving-label">Servings Per Recipe</span>
                      <span className="serving-value">{selectedRecipe.recipe_yield || selectedRecipe.recipeYield || selectedRecipe.yield}</span>
                    </div>
                  )}
                  
                  <div className="nutrition-divider thick"></div>
                  
                  {selectedRecipe.nutrition.calories && (
                    <>
                      <div className="calories-section">
                        <span className="calories-label">Calories</span>
                        <span className="calories-value">{selectedRecipe.nutrition.calories.replace(' kcal', '')}</span>
                      </div>
                      <div className="nutrition-divider medium"></div>
                    </>
                  )}
                  
                  <div className="nutrition-list">
                    {selectedRecipe.nutrition.fatContent && (
                      <div className="nutrition-row">
                        <span className="nutrient-name bold">Total Fat</span>
                        <span className="nutrient-value">{selectedRecipe.nutrition.fatContent}</span>
                      </div>
                    )}
                    {selectedRecipe.nutrition.saturatedFatContent && (
                      <div className="nutrition-row indent">
                        <span className="nutrient-name">Saturated Fat</span>
                        <span className="nutrient-value">{selectedRecipe.nutrition.saturatedFatContent}</span>
                      </div>
                    )}
                    {selectedRecipe.nutrition.unsaturatedFatContent && selectedRecipe.nutrition.unsaturatedFatContent !== "0 g" && (
                      <div className="nutrition-row indent">
                        <span className="nutrient-name">Unsaturated Fat</span>
                        <span className="nutrient-value">{selectedRecipe.nutrition.unsaturatedFatContent}</span>
                      </div>
                    )}
                    
                    {selectedRecipe.nutrition.cholesterolContent && (
                      <>
                        <div className="nutrition-divider thin"></div>
                        <div className="nutrition-row">
                          <span className="nutrient-name bold">Cholesterol</span>
                          <span className="nutrient-value">{selectedRecipe.nutrition.cholesterolContent}</span>
                        </div>
                      </>
                    )}
                    
                    {selectedRecipe.nutrition.sodiumContent && (
                      <>
                        <div className="nutrition-divider thin"></div>
                        <div className="nutrition-row">
                          <span className="nutrient-name bold">Sodium</span>
                          <span className="nutrient-value">{selectedRecipe.nutrition.sodiumContent}</span>
                        </div>
                      </>
                    )}
                    
                    {selectedRecipe.nutrition.carbohydrateContent && (
                      <>
                        <div className="nutrition-divider thin"></div>
                        <div className="nutrition-row">
                          <span className="nutrient-name bold">Total Carbohydrate</span>
                          <span className="nutrient-value">{selectedRecipe.nutrition.carbohydrateContent}</span>
                        </div>
                      </>
                    )}
                    {selectedRecipe.nutrition.fiberContent && (
                      <div className="nutrition-row indent">
                        <span className="nutrient-name">Dietary Fiber</span>
                        <span className="nutrient-value">{selectedRecipe.nutrition.fiberContent}</span>
                      </div>
                    )}
                    {selectedRecipe.nutrition.sugarContent && (
                      <div className="nutrition-row indent">
                        <span className="nutrient-name">Total Sugars</span>
                        <span className="nutrient-value">{selectedRecipe.nutrition.sugarContent}</span>
                      </div>
                    )}
                    
                    {selectedRecipe.nutrition.proteinContent && (
                      <>
                        <div className="nutrition-divider thin"></div>
                        <div className="nutrition-row">
                          <span className="nutrient-name bold">Protein</span>
                          <span className="nutrient-value">{selectedRecipe.nutrition.proteinContent}</span>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="nutrition-divider thick"></div>
                  
                  <div className="nutrition-footer">
                    <p className="nutrition-note">* Nutrition information is estimated based on the ingredients and cooking instructions for each recipe.</p>
                  </div>
                </div>
            ) : (
              <>
                {/* Ingredients Panel */}
                <div className="recipe-panel glass">
                  <h2>Ingredients</h2>
                  <ul className="ingredients-list">
                    {(selectedRecipe.recipeIngredient || selectedRecipe.ingredients || []).map((ingredient, index) => (
                      <li key={index}>{ingredient}</li>
                    ))}
                  </ul>
                </div>
                
                {/* Instructions Panel */}
                <div className="recipe-panel glass">
                  <h2>Instructions</h2>
                  <ol className="instructions-list">
                    {(selectedRecipe.recipeInstructions || selectedRecipe.instructions || []).map((instruction, index) => (
                      <li key={index}>
                        {typeof instruction === 'string' ? instruction : instruction.text || ''}
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            )}
          </div>
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
