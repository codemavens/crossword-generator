// Rasterises a proof SVG (built from geometry only) to a PNG of the given pixel width.
export const PROOF_PNG_WIDTH_PX = 2000;

export async function svgToPng(svg: string, widthMm: number, heightMm: number, widthPx = PROOF_PNG_WIDTH_PX): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("The picture could not be drawn."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = Math.max(1, Math.round((widthPx * heightMm) / widthMm));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("The browser could not make a drawing surface.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The PNG could not be created.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
