import { useEffect, useState, useRef } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'https://recipe-scraper.nolanfoster.workers.dev'; // Main recipe worker with KV storage
const CLIPPER_API_URL = import.meta.env.VITE_CLIPPER_API_URL || 'https://recipe-clipper-worker.nolanfoster.workers.dev'; // Clipper worker
const SEARCH_DB_URL = import.meta.env.VITE_SEARCH_DB_URL || 'https://recipe-search-db.nolanfoster.workers.dev'; // Search database worker
const RECOMMENDATION_API_URL = import.meta.env.VITE_RECOMMENDATION_API_URL || 'https://recipe-recommendation-worker.nolanfoster.workers.dev'; // Recommendation worker

// Function to convert ISO 8601 duration to human readable format
function formatDuration(duration) {
  if (!duration) return '';
  
  // Attempt to coerce non-string durations to string safely
  if (typeof duration !== 'string') {
    try {
      const coerced = duration.toString();
      if (typeof coerced !== 'string') return '';
      duration = coerced;
    } catch (error) {
      return '';
    }
  }
  
  // If it's already in a readable format (doesn't start with PT), return as is
  if (!duration.startsWith('PT')) return duration;
  
  try {
    // Remove the PT prefix
    let remaining = duration.substring(2);
    
    let hours = 0;
    let minutes = 0;
    
    // Extract hours if present
    const hourMatch = remaining.match(/(\d+)H/);
    if (hourMatch) {
      hours = parseInt(hourMatch[1], 10);
      remaining = remaining.replace(hourMatch[0], '');
    }
    
    // Extract minutes if present
    const minuteMatch = remaining.match(/(\d+)M/);
    if (minuteMatch) {
      minutes = parseInt(minuteMatch[1], 10);
    }
    
    // Format the output
    let result = '';
    if (hours > 0) {
      result += `${hours} h`;
      if (minutes > 0) {
        result += ` ${minutes} m`;
      }
    } else if (minutes > 0) {
      result += `${minutes} m`;
    } else {
      // If no hours or minutes found, return empty for fallback
      return duration;
    }
    
    return result;
  } catch (error) {
    console.error('Error parsing duration:', error);
    return duration;
  }
}

// Function to check if a string is a valid URL
function isValidUrl(string) {
  try {
    // Check if it starts with http://, https://, or www.
    if (string.match(/^(https?:\/\/)/i)) {
      new URL(string);
      return true;
    }
    
    if (string.match(/^www\./i)) {
      new URL(`https://${string}`);
      return true;
    }
    
    // Check if it looks like a domain with TLD
    // Must have at least one dot and a valid TLD (2+ chars)
    // Must not contain spaces
    if (!string.includes(' ') && string.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)*\.[a-zA-Z]{2,}$/)) {
      // Additional check: the part before the last dot should have at least 2 characters
      const parts = string.split('.');
      if (parts.length >= 2 && parts[parts.length - 2].length >= 2) {
        new URL(`https://${string}`);
        return true;
      }
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

// Video Popup Component
function VideoPopup({ videoUrl, onClose }) {
  const [position, setPosition] = useState({ x: 20, y: window.innerHeight - 280 });
  const [size, setSize] = useState({ width: 600, height: 450 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [videoError, setVideoError] = useState(false);
  const popupRef = useRef(null);

  // Convert various video URLs to embeddable format
  const getEmbedUrl = (url) => {
    if (!url) return '';
    
    try {
      const urlObj = new URL(url);
      
      // YouTube
      if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
        let videoId = '';
        if (urlObj.hostname.includes('youtu.be')) {
          videoId = urlObj.pathname.slice(1);
        } else if (urlObj.searchParams.get('v')) {
          videoId = urlObj.searchParams.get('v');
        }
        if (videoId) {
          return `https://www.youtube.com/embed/${videoId}`;
        }
      }
      
      // Vimeo
      if (urlObj.hostname.includes('vimeo.com')) {
        const videoId = urlObj.pathname.slice(1);
        if (videoId) {
          return `https://player.vimeo.com/video/${videoId}`;
        }
      }
      
      // For other URLs, try to use as-is (might work for some embeddable content)
      return url;
    } catch (error) {
      console.error('Error parsing video URL:', error);
      return url;
    }
  };

  const embedUrl = getEmbedUrl(videoUrl);

  // Handle mouse down for dragging
  const handleMouseDown = (e) => {
    if (e.target.closest('.video-popup-header') || e.target.closest('.video-popup-controls')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  // Handle mouse down for resizing
  const handleResizeMouseDown = (e) => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    });
  };

  // Handle mouse move
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        
        // Keep popup within viewport bounds
        const maxX = window.innerWidth - size.width;
        const maxY = window.innerHeight - size.height;
        
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        
        const newWidth = Math.max(200, Math.min(600, resizeStart.width + deltaX));
        const newHeight = Math.max(150, Math.min(450, resizeStart.height + deltaY));
        
        setSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStart, size.width, size.height]);

  // Handle window resize to keep popup in bounds
  useEffect(() => {
    const handleResize = () => {
      const maxX = window.innerWidth - size.width;
      const maxY = window.innerHeight - size.height;
      
      setPosition({
        x: Math.max(0, Math.min(position.x, maxX)),
        y: Math.max(0, Math.min(position.y, maxY))
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position.x, position.y, size.width, size.height]);

  return (
    <div
      ref={popupRef}
      className="video-popup"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex: 4000,
        cursor: isDragging ? 'grabbing' : 'default'
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header with controls */}
      <div className="video-popup-header">
        <div className="video-popup-title">🎥 Recipe Video</div>
        <div className="video-popup-controls">
          <button 
            className="video-popup-minimize" 
            onClick={() => setSize({ width: 200, height: 150 })}
            title="Minimize"
          >
            −
          </button>
          <button 
            className="video-popup-maximize" 
            onClick={() => setSize({ width: 800, height: 600 })}
            title="Maximize"
          >
            □
          </button>
          <button 
            className="video-popup-close" 
            onClick={onClose}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>
      
      {/* Video content */}
      <div className="video-popup-content">
        {embedUrl && !videoError ? (
          <iframe
            src={embedUrl}
            title="Recipe Video"
            width="100%"
            height="100%"
            frameBorder="0"
            allowFullScreen
            style={{ border: 'none' }}
            onError={() => setVideoError(true)}
            onLoad={() => setVideoError(false)}
          />
        ) : (
          <div className="video-error">
            <div className="video-error-content">
              <span className="video-error-icon">⚠️</span>
              <p>Unable to load video</p>
              <p className="video-error-url">{videoUrl}</p>
              <a 
                href={videoUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="video-error-link"
              >
                Open in new tab
              </a>
            </div>
          </div>
        )}
      </div>
      
      {/* Resize handle */}
      <div 
        className="video-popup-resize-handle"
        onMouseDown={handleResizeMouseDown}
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '20px',
          height: '20px',
          cursor: 'nw-resize',
          background: 'rgba(255, 255, 255, 0.3)',
          borderRadius: '0 0 8px 0'
        }}
      />
    </div>
  );
}

function App() {
  const [recipes, setRecipes] = useState([]);
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
  const [showSharePanel, setShowSharePanel] = useState(false); // New state for share panel
  const [showNutrition, setShowNutrition] = useState(false); // State for toggling nutrition view
  const [recommendations, setRecommendations] = useState(null); // New state for recipe recommendations
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(true); // Start with loading state true
  const [userLocation, setUserLocation] = useState(null); // User's location for recommendations
  const [externalRecipes, setExternalRecipes] = useState({}); // State for external recipes from search database
  const seasoningCanvasRef = useRef(null);
  const seasoningRef = useRef(null);
  const recipeGridRef = useRef(null);
  const recipeFullscreenRef = useRef(null);
  const searchTimeoutRef = useRef(null); // Add ref for debounce timeout
  const recipeContentRef = useRef(null);

  useEffect(() => {
    fetchRecipes();
    checkClipperHealth(); // Check clipper worker health on startup
    // Fetch recommendations but don't let it block the app
    fetchRecommendations().catch(err => {
      console.error('Failed to fetch initial recommendations:', err);
    });
  }, []);

  // Fetch external recipes when recommendations change
  useEffect(() => {
    if (recommendations && recommendations.recommendations) {
      const fetchExternalRecipes = async () => {
        const externalData = {};
        for (const [categoryName, tags] of Object.entries(recommendations.recommendations)) {
          if (Array.isArray(tags)) {
            try {
              const externalRecipes = await searchRecipesByTags(tags, 3);
              externalData[categoryName] = externalRecipes;
            } catch (error) {
              console.error(`Error fetching external recipes for ${categoryName}:`, error);
              externalData[categoryName] = [];
            }
          }
        }
        setExternalRecipes(externalData);
      };
      fetchExternalRecipes();
    }
  }, [recommendations]);

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

  async function fetchRecipes() {
    try {
      const res = await fetch(`${API_URL}/recipes?limit=10`);
      if (res.ok) {
        const data = await res.json();
        // The KV worker returns { success: true, recipes: [...], cursor: ..., list_complete: ... }
        if (data.success && Array.isArray(data.recipes)) {
          // Transform KV recipe format to frontend format
          const transformedRecipes = data.recipes.map(recipe => {
            // Extract the actual recipe data from the KV structure
            const recipeData = recipe.data || recipe;
            return {
              id: recipe.id || recipeData.id,
              name: recipeData.name || '',
              description: recipeData.description || '',
              image: recipeData.image || recipeData.image_url || '',
              image_url: recipeData.image || recipeData.image_url || '',
              ingredients: recipeData.ingredients || recipeData.recipeIngredient || [],
              instructions: recipeData.instructions || recipeData.recipeInstructions || [],
              recipeIngredient: recipeData.recipeIngredient || recipeData.ingredients || [],
              recipeInstructions: recipeData.recipeInstructions || recipeData.instructions || [],
              prep_time: recipeData.prepTime || recipeData.prep_time || null,
              cook_time: recipeData.cookTime || recipeData.cook_time || null,
              recipe_yield: recipeData.recipeYield || recipeData.recipe_yield || recipeData.yield || null,
              source_url: recipeData.source_url || recipe.url || '',
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
          });
          setRecipes(transformedRecipes);
        } else {
          console.error('Invalid response format from KV worker:', data);
          setRecipes([]);
        }
      } else {
        console.error('Failed to fetch recipes:', res.status);
        setRecipes([]);
      }
    } catch (e) {
      console.error('Error fetching recipes:', e);
      setRecipes([]);
    }
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
      url: manualRecipeUrl,
      title: name,
      description,
      imageUrl: '', // Will be updated after image upload
      ingredients: ingredients.filter(i => i.trim()),
      instructions: instructions.filter(i => i.trim()),
      prepTime: prepTime ? `PT${prepTime}M` : null,
      cookTime: cookTime ? `PT${cookTime}M` : null,
      servings: recipeYield || null,
      // Backward compatibility fields
      name,
      recipeIngredient: ingredients.filter(i => i.trim()),
      recipeInstructions: instructions.filter(i => i.trim()),
      recipeYield: recipeYield || null,
      source_url: manualRecipeUrl,
      image_url: ''
    };
    
    try {
      // Use the recipe-save-worker to save the recipe
      const response = await fetch('https://recipe-save-worker.nolanfoster.workers.dev/recipe/save', {
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
        fetchRecipes();
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
        servings: editableRecipe.recipeYield || editableRecipe.servings,
        // Backward compatibility fields
        name: editableRecipe.name,
        recipeIngredient: editableRecipe.recipeIngredient || editableRecipe.ingredients || [],
        recipeInstructions: editableRecipe.recipeInstructions || editableRecipe.instructions || [],
        recipeYield: editableRecipe.recipeYield || editableRecipe.servings
      };
      
      // Use the recipe-save-worker to update the recipe
      const response = await fetch('https://recipe-save-worker.nolanfoster.workers.dev/recipe/update', {
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
        fetchRecipes();
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
      const response = await fetch('https://recipe-save-worker.nolanfoster.workers.dev/recipe/delete', {
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
        fetchRecipes();
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
      
      // For clipped recipes, we need to use the scrape endpoint with the source URL
      // This will save the recipe to KV storage
      const sourceUrl = clippedRecipePreview.source_url;
      if (!sourceUrl) {
        throw new Error('No source URL found for clipped recipe. Please try clipping the recipe again.');
      }
      
      // First check if the recipe already exists by trying to get it from the clipper
      try {
        const checkRes = await fetch(`${CLIPPER_API_URL}/cached?url=${encodeURIComponent(sourceUrl)}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        
        if (checkRes.ok) {
          // Recipe already exists in KV store - just proceed silently
          fetchRecipes(); // Refresh the recipe list
          setClippedRecipePreview(null);
          setClipError('');
          setIsEditingPreview(false);
          setEditablePreview(null);
          return;
        }
      } catch (checkError) {
        console.log('Error checking existing recipe, proceeding with save:', checkError);
      }
      
      const res = await fetch(`${API_URL}/scrape?url=${encodeURIComponent(sourceUrl)}&save=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: [sourceUrl],
          save: true,
          avoidOverwrite: false
        }),
      });
      
      if (res.ok) {
        const result = await res.json();
        fetchRecipes(); // Refresh the recipe list
        setClippedRecipePreview(null);
        setClipError('');
        setIsEditingPreview(false);
        setEditablePreview(null);
        alert('Recipe saved successfully to KV storage!');
      } else {
        const errorText = await res.text();
        console.error('Failed to save recipe to KV:', res.status, errorText);
        
        // Handle duplicate errors from backend
        if (errorText.includes('already exists')) {
          // Recipe already exists - just proceed silently
          fetchRecipes(); // Refresh the recipe list
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
      if (error.message.includes('already exists')) {
        // Recipe already exists - just proceed silently
        fetchRecipes(); // Refresh the recipe list
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
    const duplicates = recipes.filter(recipe => {
      // Check for exact name and source match
      if (recipe.name.toLowerCase() === recipeToCheck.name.toLowerCase() &&
          recipe.source_url === recipeToCheck.source_url) {
        return true;
      }
      
      // Check for very similar names (typo detection)
      const nameSimilarity = calculateSimilarity(
        recipe.name.toLowerCase(), 
        recipeToCheck.name.toLowerCase()
      );
      if (nameSimilarity > 0.8 && recipe.source_url === recipeToCheck.source_url) {
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
    
    setIsSearching(true);
    setShowSearchResults(true);
    
    try {
      const res = await fetch(`${SEARCH_DB_URL}/api/search?q=${encodeURIComponent(query)}&type=RECIPE&limit=20`);
      
      if (res.ok) {
        const result = await res.json();
        // Transform search results to match the frontend format
        const transformedResults = result.results.map(node => {
          const properties = node.properties;
          return {
            id: node.id,
            name: properties.title || properties.name || 'Untitled Recipe',
            description: properties.description || '',
            image: properties.image || properties.image_url || '',
            image_url: properties.image || properties.image_url || '',
            prep_time: properties.prepTime || properties.prep_time || null,
            cook_time: properties.cookTime || properties.cook_time || null,
            recipe_yield: properties.servings || properties.recipeYield || properties.recipe_yield || null,
            source_url: properties.url || properties.source_url || '',
            // Include full recipe data for when user selects a result
            ingredients: properties.ingredients || [],
            instructions: properties.instructions || [],
            recipeIngredient: properties.ingredients || [],
            recipeInstructions: properties.instructions || []
          };
        });
        
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

  // New function to search for recipes matching recommendation tags
  async function searchRecipesByTags(tags, limit = 3) {
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return [];
    }
    
    try {
      // Search for each tag with fallback strategy
      const searchPromises = tags.map(async (tag) => {
        try {
          // First try: search with the full tag
          let results = await searchWithFallback(tag, Math.ceil(limit / tags.length));
          
          // If no results, try breaking down the tag
          if (!results || results.length === 0) {
            results = await searchWithFallbackStrategy(tag, Math.ceil(limit / tags.length));
          }
          
          return results || [];
        } catch (e) {
          console.error(`Error searching for tag "${tag}":`, e);
          return [];
        }
      });
      
      const searchResults = await Promise.all(searchPromises);
      
      // Flatten and deduplicate results
      const allResults = searchResults.flat();
      const uniqueResults = new Map();
      
      allResults.forEach(node => {
        if (!uniqueResults.has(node.id)) {
          const properties = node.properties;
          uniqueResults.set(node.id, {
            id: node.id,
            name: properties.title || properties.name || 'Untitled Recipe',
            description: properties.description || '',
            image: properties.image || properties.image_url || '',
            image_url: properties.image || properties.image_url || '',
            prep_time: properties.prepTime || properties.prep_time || null,
            cook_time: properties.cookTime || properties.cook_time || null,
            recipe_yield: properties.servings || properties.recipeYield || properties.recipe_yield || null,
            source_url: properties.url || properties.source_url || '',
            ingredients: properties.ingredients || [],
            instructions: properties.instructions || [],
            recipeIngredient: properties.ingredients || [],
            recipeInstructions: properties.instructions || [],
            // Mark as external recipe
            isExternal: true
          });
        }
      });
      
      // Return up to the limit, prioritizing recipes that match multiple tags
      return Array.from(uniqueResults.values()).slice(0, limit);
    } catch (e) {
      console.error('Error searching recipes by tags:', e);
      return [];
    }
  }

  // Helper function to search with fallback strategy
  async function searchWithFallback(query, limit = 1) {
    try {
      const res = await fetch(`${SEARCH_DB_URL}/api/search?q=${encodeURIComponent(query)}&type=RECIPE&limit=${limit}`);
      if (res.ok) {
        const result = await res.json();
        return result.results || [];
      }
    } catch (e) {
      console.error(`Error searching for query "${query}":`, e);
    }
    return [];
  }

  // Fallback strategy: break down complex queries into simpler parts
  async function searchWithFallbackStrategy(originalQuery, limit = 1) {
    console.log(`Trying fallback strategy for: "${originalQuery}"`);
    
    // Strategy 1: Try with common cooking words removed
    const cookingWords = ['with', 'and', 'or', 'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for'];
    const cleanedQuery = originalQuery
      .split(' ')
      .filter(word => !cookingWords.includes(word.toLowerCase()) && word.length > 2)
      .join(' ');
    
    if (cleanedQuery !== originalQuery) {
      console.log(`Trying cleaned query: "${cleanedQuery}"`);
      let results = await searchWithFallback(cleanedQuery, limit);
      if (results && results.length > 0) {
        return results;
      }
    }
    
    // Strategy 2: Try with phrases (groups of 2-3 words)
    const words = originalQuery.split(' ').filter(word => word.length > 2);
    if (words.length >= 2) {
      // Try 3-word phrases first
      for (let i = 0; i <= words.length - 3; i++) {
        const phrase = words.slice(i, i + 3).join(' ');
        console.log(`Trying 3-word phrase: "${phrase}"`);
        let results = await searchWithFallback(phrase, limit);
        if (results && results.length > 0) {
          return results;
        }
      }
      
      // Try 2-word phrases
      for (let i = 0; i <= words.length - 2; i++) {
        const phrase = words.slice(i, i + 2).join(' ');
        console.log(`Trying 2-word phrase: "${phrase}"`);
        let results = await searchWithFallback(phrase, limit);
        if (results && results.length > 0) {
          return results;
        }
      }
    }
    
    // Strategy 3: Try individual significant words
    const significantWords = words.filter(word => word.length > 3);
    for (const word of significantWords) {
      console.log(`Trying individual word: "${word}"`);
      let results = await searchWithFallback(word, limit);
      if (results && results.length > 0) {
        return results;
      }
    }
    
    // Strategy 4: Try with any remaining words
    for (const word of words) {
      if (word.length <= 3) continue; // Skip very short words
      console.log(`Trying remaining word: "${word}"`);
      let results = await searchWithFallback(word, limit);
      if (results && results.length > 0) {
        return results;
      }
    }
    
    console.log(`All fallback strategies failed for: "${originalQuery}"`);
    return [];
  }

  async function fetchRecommendations() {
    try {
      setIsLoadingRecommendations(true);
      
      // Try to get user's location or use a default
      let location = userLocation || 'San Francisco, CA'; // Default location
      
      // Try to get user's location from browser
      if (!userLocation && navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          // For now, just use a general location based on coordinates
          location = `${position.coords.latitude.toFixed(2)}°N, ${position.coords.longitude.toFixed(2)}°W`;
          setUserLocation(location);
        } catch (geoError) {
          console.log('Could not get user location, using default');
        }
      }
      
      const currentDate = new Date().toISOString().split('T')[0];
      console.log('Fetching recommendations for date:', currentDate, 'location:', location);
      
      const res = await fetch(`${RECOMMENDATION_API_URL}/recommendations`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: location,
          date: currentDate
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log('Recommendations received:', data);
        
        // Filter out inappropriate seasonal recommendations
        if (data.recommendations && data.season) {
          const filteredRecommendations = {};
          const season = data.season.toLowerCase();
          
          Object.entries(data.recommendations).forEach(([category, tags]) => {
            if (Array.isArray(tags)) {
              // Filter out fall/winter holiday items in summer
              if (season === 'summer' && category.toLowerCase().includes('holiday')) {
                // Keep only summer-appropriate items
                filteredRecommendations[category] = tags.filter(tag => {
                  const tagLower = tag.toLowerCase();
                  // Remove fall/winter holidays
                  return !tagLower.includes('halloween') && 
                         !tagLower.includes('thanksgiving') && 
                         !tagLower.includes('christmas') &&
                         !tagLower.includes('pumpkin') &&
                         !tagLower.includes('gingerbread');
                });
              } else if (season === 'winter' && category.toLowerCase().includes('holiday')) {
                // Keep only winter-appropriate items
                filteredRecommendations[category] = tags.filter(tag => {
                  const tagLower = tag.toLowerCase();
                  // Remove summer holidays
                  return !tagLower.includes('4th of july') && 
                         !tagLower.includes('labor day') &&
                         !tagLower.includes('memorial day');
                });
              } else {
                // Keep all tags for non-holiday categories
                filteredRecommendations[category] = tags;
              }
            }
          });
          
          // Update the data with filtered recommendations
          data.recommendations = filteredRecommendations;
        }
        
        setRecommendations(data);
      } else {
        console.error('Failed to fetch recommendations:', res.status);
        setRecommendations(null);
      }
    } catch (e) {
      console.error('Error fetching recommendations:', e);
      setRecommendations(null);
    } finally {
      setIsLoadingRecommendations(false);
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
            {/* Show recommendations or loading state */}
            {isLoadingRecommendations || recommendations ? (
              <div className="recommendations-container">
                {(() => {
                  try {
                    // Show loading state with placeholder categories
                    if (isLoadingRecommendations || !recommendations || !recommendations.recommendations) {
                      const loadingCategories = ['Seasonal Favorites', 'Local Specialties', 'Holiday Treats'];
                      return loadingCategories.map(categoryName => (
                        <div key={categoryName} className="recommendation-category">
                          <h2 className="category-title">{categoryName}</h2>
                          <div className="recipe-grid category-recipes">
                            {[1, 2, 3].map(index => (
                              <div key={index} className="recipe-card loading-card">
                                <div className="recipe-card-image loading-pulse">
                                  <div className="loading-shimmer"></div>
                                </div>
                                <div className="recipe-card-content">
                                  <div className="loading-text loading-pulse"></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ));
                    }
                    
                    // Track which recipes have been shown to avoid duplicates
                    const shownRecipeIds = new Set();
                    
                    return Object.entries(recommendations.recommendations).map(([categoryName, tags]) => {
                  // Ensure tags is an array
                  if (!Array.isArray(tags)) {
                    console.error(`Invalid tags format for category ${categoryName}:`, tags);
                    return null;
                  }
                  
                  console.log(`Processing category: ${categoryName} with tags:`, tags);
                  
                  // Get external recipes for this category (no longer using local recipes)
                  const categoryExternalRecipes = externalRecipes[categoryName] || [];
                  
                  // Filter out duplicates across categories
                  const uniqueExternalRecipes = categoryExternalRecipes.filter(external => 
                    !shownRecipeIds.has(external.id)
                  );
                  
                  // Take up to 3 recipes for this category
                  const sortedRecipes = uniqueExternalRecipes.slice(0, 3);
                  
                  // Add selected recipes to the shown set
                  sortedRecipes.forEach(recipe => shownRecipeIds.add(recipe.id));
                  
                  // Only show category if it has recipes
                  if (sortedRecipes.length === 0) return null;
                  
                  return (
                    <div key={categoryName} className="recommendation-category">
                      <h2 className="category-title">{categoryName}</h2>
                      <div className="recipe-grid category-recipes" ref={recipeGridRef}>
                        {sortedRecipes.map((recipe) => (
                          <div key={recipe.id} className="recipe-card" onClick={() => openRecipeView(recipe)}>
                            <div className="recipe-card-image">
                              {/* Main image display */}
                              {(recipe.image || recipe.image_url) ? (
                                <img 
                                  src={recipe.image || recipe.image_url} 
                                  alt={recipe.name}
                                  loading="lazy"
                                  style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    zIndex: 1,
                                    borderRadius: '20px 20px 0 0',
                                    opacity: 0.85
                                  }}
                                  onError={(e) => {
                                    // Fallback to gradient if image fails
                                    e.target.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  width: '100%',
                                  height: '100%',
                                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                  zIndex: 1,
                                  opacity: 0.85
                                }}></div>
                              )}
                              <div className="recipe-card-overlay"></div>
                              <div className="recipe-card-title-overlay">
                                <h3 className="recipe-card-title">{recipe.name}</h3>

                              </div>
                            </div>
                            <div className="recipe-card-content">
                              {recipe.prep_time || recipe.cook_time || recipe.recipe_yield || recipe.recipeYield || recipe.yield ? (
                                <div className="recipe-card-time">
                                  <div className="time-item">
                                    <span className="time-label">Prep</span>
                                    <span className="time-value">{formatDuration(recipe.prep_time || recipe.prepTime) || '-'}</span>
                                  </div>
                                  <div className="time-divider"></div>
                                  <div className="time-item">
                                    <span className="time-label">Cook</span>
                                    <span className="time-value">{formatDuration(recipe.cook_time || recipe.cookTime) || '-'}</span>
                                  </div>
                                  {(recipe.recipe_yield || recipe.recipeYield || recipe.yield) && (
                                    <>
                                      <div className="time-divider"></div>
                                      <div className="time-item">
                                        <span className="time-label">Yield</span>
                                        <span className="time-value">{recipe.recipe_yield || recipe.recipeYield || recipe.yield}</span>
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
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
                  } catch (error) {
                    console.error('Error rendering recommendations:', error);
                    return null;
                  }
                })()}
              </div>
            ) : null}
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
