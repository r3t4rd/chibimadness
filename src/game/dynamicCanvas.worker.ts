import { drawWorldInput, type WorldRenderInput } from './worldRenderer';

type WorkerMessage =
  | { type: 'init'; canvas: OffscreenCanvas }
  | { type: 'render'; id: number; input: WorldRenderInput; camera: { x: number; y: number; zoom: number } }
  | { type: 'clear' };

let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;

const postToMain = (message: unknown) => {
  (self as unknown as { postMessage: (value: unknown) => void }).postMessage(message);
};

self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (message.type === 'init') {
    canvas = message.canvas;
    context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) postToMain({ error: 'OffscreenCanvas 2D is unavailable' });
    return;
  }
  if (!canvas || !context) {
    if (message.type === 'render') postToMain({ id: message.id, error: 'Dynamic canvas was not initialized' });
    return;
  }
  if (message.type === 'clear') {
    context.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  try {
    if (canvas.width !== message.input.canvasWidth || canvas.height !== message.input.canvasHeight) {
      canvas.width = message.input.canvasWidth;
      canvas.height = message.input.canvasHeight;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawWorldInput(context as unknown as CanvasRenderingContext2D, message.input, {
      layer: 'dynamic',
      camera: message.camera,
    });
    postToMain({ id: message.id, paintedAt: performance.now() });
  } catch (error) {
    postToMain({
      id: message.id,
      error: error instanceof Error ? error.message : 'Dynamic canvas render failed',
    });
  }
});
