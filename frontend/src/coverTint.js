// The dominant colour of a cover image, for tinting a page header. Reading
// pixels needs the image host to allow it (CORS); when it doesn't, or the
// image fails, this resolves to null and the header keeps the theme colours.
const cache = new Map();

export function coverTint(url) {
  if (!url) return Promise.resolve(null);
  if (!cache.has(url)) cache.set(url, sample(url));
  return cache.get(url);
}

function sample(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        // Average weighted by saturation, so a colourful area wins over grey.
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < data.length; i += 4) {
          const [pr, pg, pb] = [data[i], data[i + 1], data[i + 2]];
          const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
          const weight = 0.05 + (max ? (max - min) / max : 0);
          r += pr * weight; g += pg * weight; b += pb * weight; w += weight;
        }
        resolve(`rgb(${Math.round(r / w)} ${Math.round(g / w)} ${Math.round(b / w)})`);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
