// Script to add a pane glass (window glass) recipe
const recipeData = {
  name: "Pane Glass (Window Glass)",
  description: "Traditional recipe for making clear pane glass suitable for windows. This ancient technique involves carefully melting and mixing raw materials at high temperatures.",
  image: "https://images.unsplash.com/photo-1564421406241-419bb8b2dc05?w=800&q=80",
  author: "Master Glassmaker",
  datePublished: new Date().toISOString(),
  prepTime: "PT30M",
  cookTime: "PT8H",
  totalTime: "PT8H30M",
  recipeYield: "10 window panes",
  recipeCategory: "Crafting",
  recipeCuisine: "Industrial",
  keywords: "glass, window, pane, silica, soda ash, limestone",
  recipeIngredient: [
    "60% Silica sand (SiO2) - finely ground",
    "20% Soda ash (Sodium carbonate, Na2CO3)",
    "10% Limestone (Calcium carbonate, CaCO3)",
    "5% Dolomite (CaMg(CO3)2)",
    "3% Feldspar",
    "2% Salt cake (Sodium sulfate)",
    "Small amounts of iron oxide for clarity control",
    "Cullet (recycled glass) - optional, up to 30% of total batch"
  ],
  recipeInstructions: [
    {
      "@type": "HowToStep",
      "text": "Prepare the batch: Carefully weigh and mix all dry ingredients in the correct proportions. Ensure uniform distribution to prevent defects in the final glass."
    },
    {
      "@type": "HowToStep", 
      "text": "Load the furnace: Transfer the batch mixture into a high-temperature furnace capable of reaching 1700°C (3100°F). If using cullet, add it with the batch."
    },
    {
      "@type": "HowToStep",
      "text": "Melting phase: Heat the batch to 1700°C. The materials will gradually melt and combine chemically. This process takes 6-8 hours for complete melting and homogenization."
    },
    {
      "@type": "HowToStep",
      "text": "Refining: Maintain temperature at 1500°C for 2-3 hours to allow bubbles to rise and escape, ensuring clarity. Stir occasionally with heat-resistant tools."
    },
    {
      "@type": "HowToStep",
      "text": "Conditioning: Gradually cool the molten glass to 1200°C to achieve proper viscosity for forming. This takes about 1 hour."
    },
    {
      "@type": "HowToStep",
      "text": "Forming: Pour the molten glass onto a flat, polished metal table. Use a roller to spread it evenly to desired thickness (typically 3-6mm for window panes)."
    },
    {
      "@type": "HowToStep",
      "text": "Annealing: Transfer the formed glass sheets to an annealing lehr. Cool slowly from 550°C to room temperature over 2-4 hours to relieve internal stresses."
    },
    {
      "@type": "HowToStep",
      "text": "Cutting and finishing: Once cooled, cut the glass sheets to desired window pane sizes using a glass cutter. Polish edges for safety."
    },
    {
      "@type": "HowToStep",
      "text": "Quality inspection: Check for bubbles, inclusions, or distortions. Good window glass should be clear, flat, and free from defects."
    }
  ],
  nutrition: {
    servingSize: "Not applicable - Industrial product"
  },
  video: {
    contentUrl: "https://www.youtube.com/watch?v=example-glass-making"
  },
  source_url: "https://example.com/traditional-glass-making"
};

// Function to add recipe to database
async function addRecipe() {
  try {
    // For local testing, you would need to update this URL to your worker endpoint
    const response = await fetch('http://localhost:8787/recipe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recipeData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Recipe added successfully:', result);
  } catch (error) {
    console.error('Error adding recipe:', error);
  }
}

// Export the recipe data for direct database insertion if needed
module.exports = { recipeData };

// If running this script directly
if (require.main === module) {
  console.log('Recipe data prepared for pane glass:');
  console.log(JSON.stringify(recipeData, null, 2));
}