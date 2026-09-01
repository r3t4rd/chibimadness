import { drawWorldInput, type WorldRenderInput } from './worldRenderer';

type WorkerMessage =
  | { type: 'render'; id: number; input: WorldRenderInput; camera: { x: number; y: number; zoom: number } }
  | { type: 'clear' };

let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;

const postToMain = (message: unknown, transfer?: Transferable[]) => {
  (self as unknown as { postMessage: (value: unknown, transfers?: Transferable[]) => void }).postMessage(message, transfer);
};

self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (message.type === 'clear') {
    context?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
    return;
  }

  try {
    if (!canvas || canvas.width !== message.input.canvasWidth || canvas.height !== message.input.canvasHeight) {
      canvas = new OffscreenCanvas(message.input.canvasWidth, message.input.canvasHeight);
      context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    }
    if (!canvas || !context) throw new Error('OffscreenCanvas 2D is unavailable');
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawWorldInput(context as unknown as CanvasRenderingContext2D, message.input, {
      layer: 'dynamic',
      camera: message.camera,
    });
    const image = canvas.transferToImageBitmap();
    postToMain({ id: message.id, width: canvas.width, height: canvas.height, image }, [image]);
  } catch (error) {
    postToMain({
      id: message.id,
      error: error instanceof Error ? error.message : 'Dynamic canvas render failed',
    });
  }
});
