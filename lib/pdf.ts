/**
 * Browser-side PDF → image conversion.
 *
 * The supabase storage bucket only holds PNG/JPEG/WEBP. When the user picks a
 * PDF poster, we render its first page to a canvas and export that canvas as
 * a PNG File. The PNG is what we hand to the existing upload pipeline — the
 * PDF itself never leaves the browser.
 *
 * pdfjs-dist is dynamically imported so it only loads once a PDF is actually
 * picked, keeping the admin bundle small.
 */
import { randomId } from "./utils";

type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJs> | null = null;

async function getPdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      // Use the version-matched worker from cdnjs so we don't need a bundler config.
      mod.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${mod.version}/pdf.worker.min.mjs`;
      return mod;
    });
  }
  return pdfjsPromise;
}

export type PdfConvertOptions = {
  /** Target pixel width of the rendered output. Defaults to 1600. */
  maxWidth?: number;
  /** JPEG quality 0–1 when format is image/jpeg. Ignored for PNG. */
  quality?: number;
  /** Output mime type. Defaults to image/png for max fidelity. */
  format?: "image/png" | "image/jpeg";
};

export async function pdfFirstPageToImage(
  file: File,
  options: PdfConvertOptions = {}
): Promise<File> {
  if (typeof window === "undefined") {
    throw new Error("PDF conversion only runs in the browser.");
  }

  const { maxWidth = 1600, quality = 0.92, format = "image/png" } = options;

  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const pdf = await loadingTask.promise;

  try {
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(maxWidth / baseViewport.width, 4); // cap upscale at 4x
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser does not support canvas 2D context.");

    // Some Safari versions stutter without a white backdrop for transparent PDFs.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport
    } as Parameters<typeof page.render>[0]).promise;

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Could not export canvas."))),
        format,
        quality
      )
    );

    const ext = format === "image/jpeg" ? "jpg" : "png";
    const base = file.name.replace(/\.pdf$/i, "") || `poster-${randomId()}`;
    return new File([blob], `${base}.${ext}`, { type: format });
  } finally {
    pdf.destroy().catch(() => {});
  }
}

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" || /\.pdf$/i.test(file.name)
  );
}
