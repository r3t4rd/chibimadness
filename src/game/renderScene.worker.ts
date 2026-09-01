import { compileWorldScene, type WorldRenderInput } from './worldRenderer';

type SceneCompileRequest = {
  id: number;
  input: WorldRenderInput;
};

const measurementContext = new OffscreenCanvas(1, 1).getContext('2d');

self.addEventListener('message', (event: MessageEvent<SceneCompileRequest>) => {
  if (!measurementContext) {
    self.postMessage({ id: event.data.id, error: 'OffscreenCanvas 2D is unavailable' });
    return;
  }
  try {
    const scene = compileWorldScene(measurementContext, event.data.input);
    self.postMessage({ id: event.data.id, scene });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : 'RenderScene compiler failed',
    });
  }
});
