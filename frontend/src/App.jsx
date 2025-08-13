
import { useEffect, useState, useRef } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'https://recipe-worker.nolanfoster.workers.dev'; // Main recipe worker
const CLIPPER_API_URL = import.meta.env.VITE_CLIPPER_API_URL || 'https://recipe-clipper-worker.nolanfoster.workers.dev'; // Clipper worker

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
        {embedUrl ? (
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
  const [ingredients, setIngredients] = useState('');
  const [instructions, setInstructions] = useState('');
  const [clipUrl, setClipUrl] = useState('');
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showClipForm, setShowClipForm] = useState(false);
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
  const seasoningCanvasRef = useRef(null);
  const seasoningRef = useRef(null);
  const recipeGridRef = useRef(null);
  const recipeFullscreenRef = useRef(null);

  useEffect(() => {
    fetchRecipes();
    checkClipperHealth(); // Check clipper worker health on startup
  }, []);

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
      const titleElement = document.querySelector('.title');
      if (titleElement) {
        if (scrollY > 50) {
          titleElement.classList.add('fade-out');
        } else {
          titleElement.classList.remove('fade-out');
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
      const res = await fetch(`${API_URL}/recipes`);
      if (res.ok) {
        const data = await res.json();
        setRecipes(data);
      }
    } catch (e) {
      console.error('Error fetching recipes:', e);
    }
  }

  async function checkClipperHealth() {
    try {
      const res = await fetch(`${CLIPPER_API_URL}/health`);
      if (res.ok) {
        const health = await res.json();
        console.log('Clipper worker health:', health);
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
    const recipe = {
      name,
      description,
      image: '', // Will be updated after image upload
      recipeIngredient: ingredients.split('\n').filter(i => i.trim()),
      recipeInstructions: instructions.split('\n').filter(i => i.trim()),
      // Backward compatibility
      ingredients: ingredients.split('\n').filter(i => i.trim()),
      instructions: instructions.split('\n').filter(i => i.trim()),
    };
    try {
      const res = await fetch(`${API_URL}/recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe),
      });
      if (res.ok) {
        const { id } = await res.json();
        
        // Upload image if selected
        if (selectedImage) {
          await uploadImage(id, selectedImage);
        }
        
        fetchRecipes();
        resetForm();
      }
    } catch (e) {
      console.error('Error adding recipe:', e);
    }
  }

  async function updateRecipe() {
    if (!editingRecipe || !name) return;
    const recipe = {
      name,
      description,
      image: editingRecipe.image || editingRecipe.image_url || '',
      recipeIngredient: ingredients.split('\n').filter(i => i.trim()),
      recipeInstructions: instructions.split('\n').filter(i => i.trim()),
      // Backward compatibility
      ingredients: ingredients.split('\n').filter(i => i.trim()),
      instructions: instructions.split('\n').filter(i => i.trim()),
    };
    try {
      const res = await fetch(`${API_URL}/recipe/${editingRecipe.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe),
      });
      if (res.ok) {
        // Upload new image if selected
        if (selectedImage) {
          await uploadImage(editingRecipe.id, selectedImage);
        }
        
        fetchRecipes();
        resetForm();
        setEditingRecipe(null);
      }
    } catch (e) {
      console.error('Error updating recipe:', e);
    }
  }

  async function deleteRecipe(id) {
    if (!confirm('Are you sure you want to delete this recipe?')) return;
    try {
      const res = await fetch(`${API_URL}/recipe/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchRecipes();
      }
    } catch (e) {
      console.error('Error deleting recipe:', e);
    }
  }

  async function uploadImage(recipeId, file) {
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('recipeId', recipeId);
      
      const res = await fetch(`${API_URL}/upload-image`, {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        fetchRecipes(); // Refresh to show new image
      }
    } catch (e) {
      console.error('Error uploading image:', e);
    }
  }

  async function clipRecipe() {
    if (!clipUrl) return;
    setIsClipping(true);
    setClipError(''); // Clear any previous errors
    
    try {
      const res = await fetch(`${CLIPPER_API_URL}/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clipUrl }),
      });
      
      if (res.ok) {
        const result = await res.json();
        console.log('Recipe clipped successfully:', result);
        setClippedRecipePreview(result); // Store preview instead of saving immediately
        setShowClipForm(false);
      } else {
        const errorText = await res.text();
        console.error('Clip failed:', res.status, errorText);
        
        // Provide more specific error messages
        if (res.status === 404) {
          setClipError('No recipe found on this page. Please check if the URL contains a recipe.');
        } else if (res.status === 500) {
          setClipError('Recipe extraction failed. The page might be too complex or the recipe format is not supported.');
        } else if (res.status === 0 || res.status === 503) {
          setClipError('Clipper service is temporarily unavailable. Please try again later.');
        } else {
          setClipError(`Failed to clip recipe: ${errorText}`);
        }
      }
    } catch (e) {
      console.error('Error clipping recipe:', e);
      
      // Provide user-friendly error messages for network issues
      if (e.name === 'TypeError' && e.message.includes('fetch')) {
        setClipError('Unable to connect to the clipper service. Please check your internet connection and try again.');
      } else if (e.name === 'TypeError' && e.message.includes('Failed to fetch')) {
        setClipError('Clipper service is currently unavailable. Please try again later.');
      } else {
        setClipError(`Error clipping recipe: ${e.message}`);
      }
    } finally {
      setIsClipping(false);
    }
  }

  function editRecipe(recipe) {
    setEditingRecipe(recipe);
    setName(recipe.name);
    setDescription(recipe.description || '');
    // Handle both old and new schema field names
    const recipeIngredients = recipe.recipeIngredient || recipe.ingredients || [];
    const recipeInstructions = recipe.recipeInstructions || recipe.instructions || [];
    setIngredients(Array.isArray(recipeIngredients) ? recipeIngredients.join('\n') : '');
    setInstructions(Array.isArray(recipeInstructions) ? recipeInstructions.join('\n') : '');
    setSelectedImage(null);
  }

  function resetForm() {
    setName('');
    setDescription('');
    setIngredients('');
    setInstructions('');
    setSelectedImage(null);
    setEditingRecipe(null);
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
      }))
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
        console.log('Save operation already in progress, skipping...');
        return;
      }
      
      const res = await fetch(`${API_URL}/recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clippedRecipePreview),
      });
      
      if (res.ok) {
        const { id } = await res.json();
        console.log('Recipe saved successfully:', id);
        fetchRecipes(); // Refresh the recipe list
        setClippedRecipePreview(null);
        setClipUrl('');
        setClipError('');
        setIsEditingPreview(false);
        setEditablePreview(null);
        alert('Recipe saved successfully!');
      } else {
        const errorText = await res.text();
        console.error('Failed to save recipe:', res.status, errorText);
        
        // Handle duplicate errors from backend
        if (errorText.includes('already exists')) {
          alert('This recipe already exists in your collection. Please check if you have already saved it.');
        } else {
          throw new Error(`Failed to save recipe: ${errorText}`);
        }
      }
    } catch (error) {
      console.error('Error saving recipe:', error);
      if (error.message.includes('already exists')) {
        alert('This recipe already exists in your collection. Please check if you have already saved it.');
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

  return (
    <div className={`container ${selectedRecipe ? 'recipe-view-active' : ''}`}>
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
      
      <h1 className="title">
        <img src="/spoon.svg" alt="Seasoned" className="title-icon" />
        Seasoned
      </h1>
      
      {/* Floating Action Buttons */}
      <div className="fab-container">
        <button 
          className={`fab fab-clip ${clipperStatus === 'unavailable' ? 'fab-unavailable' : clipperStatus === 'available' ? 'fab-available' : 'fab-checking'}`} 
          onClick={() => setShowClipForm(true)}
          disabled={clipperStatus === 'unavailable'}
          title={clipperStatus === 'unavailable' ? 'Clipper service unavailable' : 'Clip recipe from website'}
        >
          <span className="fab-icon">
            <img src="/scissor.svg" alt="Clip" style={{ width: '24px', height: '24px' }} />
          </span>
        </button>
        <button className="fab fab-add" onClick={() => setShowAddForm(true)}>
          <span className="fab-icon">+</span>
        </button>
      </div>
      
      <div className="recipes-list">
        {/* Show recipe cards only when no forms are active and no recipe is selected */}
        {!showAddForm && !showClipForm && !clippedRecipePreview && !selectedRecipe && (
          <div className="recipe-grid" ref={recipeGridRef}>
            {recipes.map((recipe) => {
              console.log('Recipe data:', recipe);
              console.log('Image URL:', recipe.image_url);
              return (
                <div key={recipe.id} className="recipe-card" onClick={() => openRecipeView(recipe)}>
                  <div className="recipe-card-image">

                    {/* Main image display */}
                    {(recipe.image || recipe.image_url) ? (
                      <img 
                        src={recipe.image || recipe.image_url} 
                        alt={recipe.name}
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
                        onLoad={() => console.log('Image loaded successfully:', recipe.image || recipe.image_url)}
                        onError={(e) => {
                          console.error('Image failed to load:', recipe.image || recipe.image_url);
                          console.error('Error details:', e);
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
                    <div className="recipe-card-overlay">
                    </div>
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
              );
            })}
          </div>
        )}

        {/* Show Add Recipe Form when active */}
        {showAddForm && (
          <div className="form-panel glass">
            <div className="form-panel-header">
              <h2>{editingRecipe ? 'Edit Recipe' : 'Add New Recipe'}</h2>
              <button className="close-btn" onClick={() => setShowAddForm(false)}>×</button>
            </div>
            <div className="form-panel-content">
              <input 
                type="text" 
                placeholder="Name" 
                value={name} 
                onChange={e => setName(e.target.value)} 
              />
              <textarea 
                placeholder="Description" 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
              />
              <textarea 
                placeholder="Ingredients (one per line)" 
                value={ingredients} 
                onChange={e => setIngredients(e.target.value)} 
              />
              <textarea 
                placeholder="Instructions (one per line)" 
                value={instructions} 
                onChange={e => setInstructions(e.target.value)} 
              />
              
              <div className="image-upload">
                <label htmlFor="image-input" className="image-upload-label">
                  {selectedImage ? selectedImage.name : 'Choose Image (Optional)'}
                </label>
                <input
                  id="image-input"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />
              </div>
              
              <div className="form-actions">
                {editingRecipe ? (
                  <>
                    <button onClick={updateRecipe} className="update-btn">Update Recipe</button>
                    <button onClick={resetForm} className="cancel-btn">Cancel</button>
                  </>
                ) : (
                  <button onClick={addRecipe} className="add-btn">Add Recipe</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Show Clip Recipe Form when active */}
                  {showClipForm && (
            <div className="form-panel glass clipper-form">
            <div className="form-panel-header">
              <h2>Clip Recipe from Website</h2>
              <button className="close-btn" onClick={() => {
                setShowClipForm(false);
                setClipUrl('');
                setClipError('');
              }}>×</button>
            </div>
            <div className="form-panel-content">
              {/* Clipper Status Indicator */}
              <div className="clipper-status">
                {clipperStatus === 'checking' && (
                  <div className="status-message checking">
                    <span className="status-icon">⏳</span>
                    Checking clipper service...
                  </div>
                )}
                {clipperStatus === 'available' && (
                  <div className="status-message available">
                    <span className="status-icon">✓</span>
                    Clipper service is available
                  </div>
                )}
                {clipperStatus === 'unavailable' && (
                  <div className="status-message unavailable">
                    <span className="status-icon">⚠️</span>
                    Clipper service is currently unavailable
                    <button 
                      onClick={checkClipperHealth} 
                      className="retry-btn"
                      title="Retry connection"
                    >
                      🔄 Retry
                    </button>
                  </div>
                )}
              </div>
              
              <input 
                type="text" 
                placeholder="Recipe URL" 
                value={clipUrl} 
                onChange={e => setClipUrl(e.target.value)} 
              />
              
              {/* Help Text */}
              <div className="clip-help-text">
                <p>💡 <strong>How it works:</strong> Paste a URL from any recipe website and our AI will automatically extract the recipe details including ingredients, instructions, and cooking times.</p>
                <p>✨ <strong>Supported sites:</strong> AllRecipes, Food Network, Epicurious, and most recipe blogs</p>
              </div>
              
              {clipError && (
                <div className="error-message">
                  <span className="error-icon">⚠️</span>
                  {clipError}
                </div>
              )}
              <div className="form-actions">
                <button 
                  onClick={clipRecipe} 
                  className="add-btn" 
                  disabled={isClipping || clipperStatus === 'unavailable'}
                >
                  {isClipping ? '🔄 Clipping...' : (
                    <>
                      <img src="/scissor.svg" alt="Clip" style={{ width: '16px', height: '16px', marginRight: '8px', verticalAlign: 'middle' }} />
                      Clip Recipe
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Show Clipped Recipe Preview when active */}
        {clippedRecipePreview && (
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
                    <div className="recipe-preview-header">
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
                    
                    {(clippedRecipePreview.image || clippedRecipePreview.image_url) && (
                      <div className="recipe-preview-image">
                        <h4>Recipe Image</h4>
                        <img 
                          src={clippedRecipePreview.image || clippedRecipePreview.image_url} 
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
                    <button onClick={editPreview} className="edit-btn" disabled={isSavingRecipe}>
                      ✏️ Edit Recipe
                    </button>
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
                          // Store the current URL to retry with
                          const currentUrl = clippedRecipePreview.source_url;
                          setClippedRecipePreview(null);
                          setClipUrl(currentUrl);
                          setClipError('');
                          setIsEditingPreview(false);
                          setEditablePreview(null);
                          setShowClipForm(true);
                          // Show a brief message that this is a retry
                          setTimeout(() => {
                            const urlInput = document.querySelector('input[placeholder="Recipe URL"]');
                            if (urlInput) {
                              urlInput.focus();
                              urlInput.select();
                            }
                          }, 100);
                        }
                      }} 
                      className="try-again-btn"
                      disabled={isSavingRecipe}
                      title="Try clipping this recipe again"
                    >
                      🔄 Try Again
                    </button>
                    <button 
                      onClick={() => {
                        if (!isSavingRecipe) {
                          setClippedRecipePreview(null);
                          setClipUrl('');
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
        )}
      </div>

      {/* Full Screen Recipe View */}
      {selectedRecipe && (
        <div className="recipe-fullscreen" ref={recipeFullscreenRef}>
          {/* Top Header with Back Button and Action Buttons */}
          <div className="recipe-top-header">
            <button className="back-btn" onClick={() => setSelectedRecipe(null)}>
              <span className="back-arrow">←</span>
            </button>
            <div className="recipe-fullscreen-actions">
              <button 
                className="edit-btn fullscreen-edit-btn" 
                onClick={() => {
                  editRecipe(selectedRecipe);
                  setSelectedRecipe(null);
                  setShowAddForm(true);
                }}
                title="Edit Recipe"
              >
                ✏️
              </button>
              <button 
                className="delete-btn fullscreen-delete-btn" 
                onClick={() => {
                  if (confirm('Are you sure you want to delete this recipe?')) {
                    deleteRecipe(selectedRecipe.id);
                    setSelectedRecipe(null);
                  }
                }}
                title="Delete Recipe"
              >
                🗑️
              </button>
            </div>
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
                {(selectedRecipe.video_url !== undefined || (selectedRecipe.video && selectedRecipe.video.contentUrl)) && (
                  <button 
                    className="recipe-link video-link"
                    title="Watch recipe video"
                    onClick={(e) => {
                      e.stopPropagation();
                      openVideoPopup(selectedRecipe.video_url !== undefined ? selectedRecipe.video_url : (selectedRecipe.video && selectedRecipe.video.contentUrl));
                    }}
                  >
                    🎥 Watch Video
                  </button>
                )}
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
          <div className="recipe-fullscreen-content">
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
  );
}

export default App;
