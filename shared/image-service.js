/**
 * Image Service
 * Handles downloading images from URLs and uploading to R2 storage
 */

/**
 * Generate a unique filename for an image based on its URL and content
 * @param {string} originalUrl - The original image URL
 * @param {string} extension - File extension (e.g., 'jpg', 'png')
 * @returns {Promise<string>} - Unique filename
 */
async function generateImageFilename(originalUrl, extension = 'jpg') {
  // Use Web Crypto API instead of Node.js crypto
  const encoder = new TextEncoder();
  const data = encoder.encode(originalUrl);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const timestamp = Date.now();
  return `recipe-images/${timestamp}-${hashHex.substring(0, 16)}.${extension}`;
}

/**
 * Extract file extension from URL or content type
 * @param {string} url - Image URL
 * @param {string} contentType - Content type from response headers
 * @returns {string} - File extension
 */
function getImageExtension(url, contentType) {
  // Try to get extension from content type first
  if (contentType) {
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('gif')) return 'gif';
    if (contentType.includes('webp')) return 'webp';
  }
  
  // Fall back to URL extension
  const urlExtension = url.split('.').pop().toLowerCase().split('?')[0];
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(urlExtension)) {
    return urlExtension === 'jpeg' ? 'jpg' : urlExtension;
  }
  
  // Default to jpg
  return 'jpg';
}

/**
 * Download an image from a URL
 * @param {string} imageUrl - The URL of the image to download
 * @returns {Promise<{buffer: ArrayBuffer, contentType: string, extension: string}>} - Image data and metadata
 */
async function downloadImage(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('Invalid image URL provided');
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RecipeIndexBot/1.0)',
        'Accept': 'image/*,*/*;q=0.8',
      },
      // Add timeout and size limits
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    
    // Check if it's actually an image
    if (!contentType.startsWith('image/')) {
      throw new Error(`URL does not point to an image. Content-Type: ${contentType}`);
    }

    const buffer = await response.arrayBuffer();
    
    // Check file size (limit to 10MB)
    if (buffer.byteLength > 10 * 1024 * 1024) {
      throw new Error('Image file too large (max 10MB)');
    }

    const extension = getImageExtension(imageUrl, contentType);

    return {
      buffer,
      contentType,
      extension
    };
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error('Image download timeout');
    }
    throw error;
  }
}

/**
 * Upload an image to R2 storage
 * @param {Object} r2Bucket - The R2 bucket binding
 * @param {ArrayBuffer} imageBuffer - The image data
 * @param {string} filename - The filename to use in R2
 * @param {string} contentType - The content type of the image
 * @param {string} [baseUrl] - Base URL for the R2 bucket (optional)
 * @returns {Promise<string>} - The R2 URL of the uploaded image
 */
async function uploadImageToR2(r2Bucket, imageBuffer, filename, contentType, baseUrl) {
  try {
    await r2Bucket.put(filename, imageBuffer, {
      httpMetadata: {
        contentType: contentType,
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
      },
    });

    // Return the public URL (configurable base URL or default)
    const publicBaseUrl = baseUrl || 'https://recipe-images.your-domain.com';
    return `${publicBaseUrl}/${filename}`;
  } catch (error) {
    throw new Error(`Failed to upload image to R2: ${error.message}`);
  }
}

/**
 * Process and save a recipe image to R2
 * @param {Object} r2Bucket - The R2 bucket binding
 * @param {string} imageUrl - The original image URL
 * @param {string} [baseUrl] - Base URL for the R2 bucket (optional)
 * @returns {Promise<string|null>} - The new R2 image URL or null if failed
 */
async function saveRecipeImageToR2(r2Bucket, imageUrl, baseUrl) {
  if (!imageUrl || !r2Bucket) {
    return null;
  }

  try {
    // Download the image
    const { buffer, contentType, extension } = await downloadImage(imageUrl);
    
    // Generate unique filename
    const filename = await generateImageFilename(imageUrl, extension);
    
    // Upload to R2
    const r2Url = await uploadImageToR2(r2Bucket, buffer, filename, contentType, baseUrl);
    
    return r2Url;
  } catch (error) {
    console.error(`Failed to save image ${imageUrl} to R2:`, error.message);
    return null; // Return null instead of throwing to allow recipe saving to continue
  }
}

/**
 * Process multiple image URLs (for recipes with multiple images)
 * @param {Object} r2Bucket - The R2 bucket binding
 * @param {string|string[]} imageUrls - Single URL or array of URLs
 * @param {string} [baseUrl] - Base URL for the R2 bucket (optional)
 * @returns {Promise<string|string[]|null>} - Processed image URL(s) or original if processing failed
 */
async function processRecipeImages(r2Bucket, imageUrls, baseUrl) {
  if (!imageUrls) {
    return null;
  }

  if (Array.isArray(imageUrls)) {
    const processedImages = await Promise.allSettled(
      imageUrls.map(url => saveRecipeImageToR2(r2Bucket, url, baseUrl))
    );
    
    return processedImages.map((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      }
      // Return original URL if processing failed
      return imageUrls[index];
    });
  } else {
    const processedUrl = await saveRecipeImageToR2(r2Bucket, imageUrls, baseUrl);
    return processedUrl || imageUrls; // Return original URL if processing failed
  }
}

export {
  downloadImage,
  uploadImageToR2,
  saveRecipeImageToR2,
  processRecipeImages,
  generateImageFilename,
  getImageExtension
};