/* Generate a rounded browser-tab icon from the repository's current logo.png.
   This deliberately loads the source image at runtime so the favicon can never
   drift from assets/logo.png when the artwork is replaced. */
(() => {
  'use strict';

  const favicon = document.querySelector('link[data-vqc-rounded-favicon]');
  if (!favicon || !document.createElement('canvas').getContext) return;

  const scriptUrl = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : document.baseURI;
  const logoUrl = new URL('../assets/logo.png?v=20261116-current-logo-v1', scriptUrl);
  const logo = new Image();
  logo.decoding = 'async';

  logo.onload = () => {
    try {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;

      const context = canvas.getContext('2d');
      if (!context || !logo.naturalWidth || !logo.naturalHeight) return;

      const roundedRect = (x, y, width, height, radius) => {
        context.beginPath();
        context.moveTo(x + radius, y);
        context.arcTo(x + width, y, x + width, y + height, radius);
        context.arcTo(x + width, y + height, x, y + height, radius);
        context.arcTo(x, y + height, x, y, radius);
        context.arcTo(x, y, x + width, y, radius);
        context.closePath();
      };

      // Soft blue tile behind the original artwork.
      const tile = context.createLinearGradient(0, 0, size, size);
      tile.addColorStop(0, '#ffffff');
      tile.addColorStop(1, '#eaf4ff');
      roundedRect(1, 1, size - 2, size - 2, 15);
      context.fillStyle = tile;
      context.fill();

      // Draw the exact current repository image, preserving its aspect ratio.
      context.save();
      roundedRect(2, 2, size - 4, size - 4, 14);
      context.clip();

      const available = size - 12;
      const scale = Math.min(available / logo.naturalWidth, available / logo.naturalHeight);
      const width = logo.naturalWidth * scale;
      const height = logo.naturalHeight * scale;
      context.drawImage(logo, (size - width) / 2, (size - height) / 2, width, height);
      context.restore();

      roundedRect(1, 1, size - 2, size - 2, 15);
      context.strokeStyle = '#bfd8ef';
      context.lineWidth = 1.5;
      context.stroke();

      // Replace the square PNG fallback only after the source logo has loaded.
      favicon.type = 'image/png';
      favicon.href = canvas.toDataURL('image/png');
    } catch (error) {
      // Keep the original logo PNG as the safe fallback if canvas export fails.
      console.warn('[Đảo Kỳ Thủ] Không thể tạo favicon bo góc:', error);
    }
  };

  logo.onerror = () => {
    // Keep the original PNG favicon if the source image cannot be loaded.
    console.warn('[Đảo Kỳ Thủ] Không tải được assets/logo.png cho favicon.');
  };

  logo.src = logoUrl.href;
})();
