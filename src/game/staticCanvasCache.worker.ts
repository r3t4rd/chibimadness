import { drawWorldInput, type WorldRenderInput } from './worldRenderer';

type StaticCacheRequest = {
  id: number;
  input: WorldRenderInput;
  camera: { x: number; y: number; zoom: number };
  revision: string;
};

let cacheCanvas: OffscreenCanvas | null = null;
let cacheContext: OffscreenCanvasRenderingContext2D | null = null;

const postToMain = (message: unknown, transfer?: Transferable[]) => {
  (self as unknown as { postMessage: (value: unknown, transfers?: Transferable[]) => void }).postMessage(message, transfer);
};

self.addEventListener('message', (event: MessageEvent<StaticCacheRequest>) => {
  const { id, input, camera, revision } = event.data;
  try {
    if (!cacheCanvas || cacheCanvas.width !== input.canvasWidth || cacheCanvas.height !== input.canvasHeight) {
      cacheCanvas = new OffscreenCanvas(input.canvasWidth, input.canvasHeight);
      cacheContext = cacheCanvas.getContext('2d', { alpha: false });
    }
    if (!cacheCanvas || !cacheContext) {
      throw new Error('OffscreenCanvas 2D is unavailable');
    }

    cacheContext.clearRect(0, 0, input.canvasWidth, input.canvasHeight);
    // The shared renderer only uses the Canvas2D API common to both contexts.
    // TypeScript keeps the DOM and OffscreenCanvas interfaces nominally distinct.
    drawWorldInput(cacheContext as unknown as CanvasRenderingContext2D, input, { layer: 'static', camera });
    const image = cacheCanvas.transferToImageBitmap();
    postToMain({ id, camera, revision, width: input.canvasWidth, height: input.canvasHeight, image }, [image]);
  } catch (error) {
    postToMain({
      id,
      revision,
      error: error instanceof Error ? error.message : 'Static Canvas cache build failed',
    });
  }
});
