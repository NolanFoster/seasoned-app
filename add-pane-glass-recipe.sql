-- SQL script to add pane glass (window glass) recipe

INSERT INTO recipes (
    name, 
    image, 
    description, 
    author, 
    date_published, 
    prep_time, 
    cook_time, 
    total_time,
    recipe_yield, 
    recipe_category, 
    recipe_cuisine, 
    recipe_ingredient, 
    recipe_instructions,
    source_url, 
    keywords,
    video_url
)
VALUES (
    'Pane Glass (Window Glass)',
    'https://images.unsplash.com/photo-1564421406241-419bb8b2dc05?w=800&q=80',
    'Traditional recipe for making clear pane glass suitable for windows. This ancient technique involves carefully melting and mixing raw materials at high temperatures.',
    'Master Glassmaker',
    datetime('now'),
    'PT30M',
    'PT8H',
    'PT8H30M',
    '10 window panes',
    'Crafting',
    'Industrial',
    '[
        "60% Silica sand (SiO2) - finely ground",
        "20% Soda ash (Sodium carbonate, Na2CO3)",
        "10% Limestone (Calcium carbonate, CaCO3)",
        "5% Dolomite (CaMg(CO3)2)",
        "3% Feldspar",
        "2% Salt cake (Sodium sulfate)",
        "Small amounts of iron oxide for clarity control",
        "Cullet (recycled glass) - optional, up to 30% of total batch"
    ]',
    '[
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
    ]',
    'https://example.com/traditional-glass-making',
    'glass, window, pane, silica, soda ash, limestone',
    'https://www.youtube.com/watch?v=example-glass-making'
);