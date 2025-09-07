/**
 * R2 bucket upload utilities
 */

export async function uploadImageToR2(bucket, imageData, imageId, imageDomain) {
  try {
    // Convert base64 to ArrayBuffer if needed
    let imageBuffer;
    if (typeof imageData === 'string' && imageData.includes('base64')) {
      // Remove data URL prefix if present
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = base64ToArrayBuffer(base64Data);
    } else if (imageData instanceof ArrayBuffer) {
      imageBuffer = imageData;
    } else if (imageData instanceof Uint8Array) {
      imageBuffer = imageData.buffer;
    } else {
      // Assume it's already base64 without prefix
      imageBuffer = base64ToArrayBuffer(imageData);
    }

    // Generate filename with proper extension
    const filename = `ai-generated/${imageId}.png`;
    
    // Upload to R2
    await bucket.put(filename, imageBuffer, {
      httpMetadata: {
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000' // Cache for 1 year
      },
      customMetadata: {
        generatedAt: new Date().toISOString(),
        type: 'ai-generated-recipe-image'
      }
    });

    // Construct the public URL
    const imageUrl = `${imageDomain}/${filename}`;
    
    console.log('Image uploaded successfully:', imageUrl);
    
    return imageUrl;
    
  } catch (error) {
    console.error('R2 upload error:', error);
    throw new Error(`Failed to upload image to R2: ${error.message}`);
  }
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  try {
    // Decode base64 string
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes.buffer;
  } catch (error) {
    throw new Error(`Failed to decode base64 image: ${error.message}`);
  }
}

/**
 * Check if image exists in R2
 */
export async function imageExistsInR2(bucket, imageId) {
  try {
    const filename = `ai-generated/${imageId}.png`;
    const object = await bucket.head(filename);
    return object !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Delete image from R2
 */
export async function deleteImageFromR2(bucket, imageId) {
  try {
    const filename = `ai-generated/${imageId}.png`;
    await bucket.delete(filename);
    return true;
  } catch (error) {
    console.error('R2 delete error:', error);
    return false;
  }
}