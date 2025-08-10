
import { useEffect, useState, useRef } from 'react'

const API_URL = 'https://recipe-worker.nolanfoster.workers.dev'; // Replace with your worker URL

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
  const seasoningCanvasRef = useRef(null);
  const seasoningRef = useRef(null);

  useEffect(() => {
    fetchRecipes();
  }, []);

  // Dark mode detection and background initialization
  useEffect(() => {
    const checkDarkMode = () => {
      const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
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
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', checkDarkMode);
    
    return () => {
      mediaQuery.removeEventListener('change', checkDarkMode);
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

  async function addRecipe() {
    if (!name) return;
    const recipe = {
      name,
      description,
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
    try {
      const res = await fetch(`${API_URL}/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clipUrl }),
      });
      if (res.ok) {
        fetchRecipes();
        setClipUrl('');
        setShowClipForm(false);
      } else {
        alert('Failed to clip recipe');
      }
    } catch (e) {
      console.error('Error clipping recipe:', e);
      alert('Error clipping recipe');
    }
  }

  function editRecipe(recipe) {
    setEditingRecipe(recipe);
    setName(recipe.name);
    setDescription(recipe.description || '');
    setIngredients(recipe.ingredients.join('\n'));
    setInstructions(recipe.instructions.join('\n'));
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

  function openRecipeView(recipe) {
    setSelectedRecipe(recipe);
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
        <img src="/images/spoon.png" alt="Seasoned" className="title-icon" />
        Seasoned
      </h1>
      
      {/* Floating Action Buttons */}
      <div className="fab-container">
        <button className="fab fab-clip" onClick={() => setShowClipForm(true)}>
          <span className="fab-icon">✂️</span>
        </button>
        <button className="fab fab-add" onClick={() => setShowAddForm(true)}>
          <span className="fab-icon">+</span>
        </button>
      </div>
      
      <div className="recipes-list">
        <div className="recipe-grid">
          {recipes.map((recipe) => {
            console.log('Recipe data:', recipe);
            console.log('Image URL:', recipe.image_url);
            return (
              <div key={recipe.id} className="recipe-card" onClick={() => openRecipeView(recipe)}>
                <div className="recipe-card-image">

                  {/* Main image display */}
                  {recipe.image_url ? (
                    <img 
                      src={recipe.image_url} 
                      alt={recipe.name}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        zIndex: 1
                      }}
                      onLoad={() => console.log('Image loaded successfully:', recipe.image_url)}
                      onError={(e) => {
                        console.error('Image failed to load:', recipe.image_url);
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
                      zIndex: 1
                    }}></div>
                  )}
                  <div className="recipe-card-overlay">
                    <div className="recipe-card-actions">
                      <button onClick={() => editRecipe(recipe)} className="edit-btn">Edit</button>
                      <button onClick={() => deleteRecipe(recipe.id)} className="delete-btn">Delete</button>
                    </div>
                  </div>
                  <div className="recipe-card-title-overlay">
                    <h3 className="recipe-card-title">{recipe.name}</h3>
                  </div>
                </div>
                <div className="recipe-card-content">
                  {recipe.description && <p className="recipe-card-description">{recipe.description}</p>}
                  {recipe.source_url && (
                    <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="recipe-source-link">
                      View Source
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Recipe Overlay */}
      {showAddForm && (
        <div className="overlay" onClick={() => setShowAddForm(false)}>
          <div className="overlay-content glass" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-header">
              <h2>{editingRecipe ? 'Edit Recipe' : 'Add New Recipe'}</h2>
              <button className="close-btn" onClick={() => setShowAddForm(false)}>×</button>
            </div>
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

      {/* Clip Recipe Overlay */}
      {showClipForm && (
        <div className="overlay" onClick={() => setShowClipForm(false)}>
          <div className="overlay-content glass" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-header">
              <h2>Clip Recipe from Website</h2>
              <button className="close-btn" onClick={() => setShowClipForm(false)}>×</button>
            </div>
            <input 
              type="text" 
              placeholder="Recipe URL" 
              value={clipUrl} 
              onChange={e => setClipUrl(e.target.value)} 
            />
            <div className="form-actions">
              <button onClick={clipRecipe} className="add-btn">Clip Recipe</button>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Recipe View */}
      {selectedRecipe && (
        <div className="recipe-fullscreen">
          {/* Back Button */}
          <button className="back-btn" onClick={() => setSelectedRecipe(null)}>
            <span className="back-arrow">←</span>
          </button>
          
          {/* Recipe Image Header */}
          <div className="recipe-header-image">
            {selectedRecipe.image_url ? (
              <img 
                src={selectedRecipe.image_url} 
                alt={selectedRecipe.name}
                className="recipe-fullscreen-image"
              />
            ) : (
              <div className="recipe-fullscreen-placeholder">
                <div className="placeholder-gradient"></div>
              </div>
            )}
            <div className="recipe-header-overlay">
              <h1 className="recipe-fullscreen-title">{selectedRecipe.name}</h1>
            </div>
          </div>
          
          {/* Recipe Content */}
          <div className="recipe-fullscreen-content">
            {/* Ingredients Panel */}
            <div className="recipe-panel glass">
              <h2>Ingredients</h2>
              <ul className="ingredients-list">
                {selectedRecipe.ingredients.map((ingredient, index) => (
                  <li key={index}>{ingredient}</li>
                ))}
              </ul>
            </div>
            
            {/* Instructions Panel */}
            <div className="recipe-panel glass">
              <h2>Instructions</h2>
              <ol className="instructions-list">
                {selectedRecipe.instructions.map((instruction, index) => (
                  <li key={index}>{instruction}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
