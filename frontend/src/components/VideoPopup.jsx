import React, { useState, useEffect, useRef } from 'react';

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

export default VideoPopup;
