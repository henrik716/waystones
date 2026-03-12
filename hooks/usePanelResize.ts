import { useState, useEffect } from 'react';

export function usePanelResize() {
  const [previewWidth, setPreviewWidth] = useState(400);
  const [isResizingPreview, setIsResizingPreview] = useState(false);

  useEffect(() => {
    const handleResizePreview = (e: MouseEvent) => {
      if (isResizingPreview) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= 300 && newWidth <= Math.max(800, window.innerWidth * 0.6)) {
          setPreviewWidth(newWidth);
        }
      }
    };

    const stopResizingPreview = () => {
      setIsResizingPreview(false);
    };

    if (isResizingPreview) {
      window.addEventListener('mousemove', handleResizePreview);
      window.addEventListener('mouseup', stopResizingPreview);
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleResizePreview);
      window.removeEventListener('mouseup', stopResizingPreview);
      document.body.style.userSelect = '';
    };
  }, [isResizingPreview]);

  return { previewWidth, isResizingPreview, setIsResizingPreview };
}
