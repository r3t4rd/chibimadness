import {
  compileDynamicWorldScene,
  compileStaticWorldScene,
  type WorldRenderInput,
} from './worldRenderer';

type SceneCompileRequest = {
  id: number;
  input: WorldRenderInput;
};

const measurementContext = new OffscreenCanvas(1, 1).getContext('2d');
let lastStaticKey: string | null = null;

function staticSceneKey(input: WorldRenderInput, camera: { x: number; y: number; zoom: number }) {
  // Source world culling is camera-relative. Refresh the retained mesh only
  // when the camera crosses a generous tile, the viewport changes, or POIs
  // (the only static input that can be authored at runtime) change.
  return JSON.stringify({
    viewport: [input.canvasWidth, input.canvasHeight],
    cameraTile: [Math.floor(camera.x / 640), Math.floor(camera.y / 640), Math.round(camera.zoom * 20)],
    worldPois: input.worldPois ?? [],
  });
}

self.addEventListener('message', (event: MessageEvent<SceneCompileRequest>) => {
  if (!measurementContext) {
    self.postMessage({ id: event.data.id, error: 'OffscreenCanvas 2D is unavailable' });
    return;
  }
  try {
    const dynamicScene = compileDynamicWorldScene(measurementContext, event.data.input);
    const staticKey = staticSceneKey(event.data.input, dynamicScene.camera);
    const staticScene = staticKey === lastStaticKey
      ? undefined
      : compileStaticWorldScene(measurementContext, event.data.input, dynamicScene.camera);
    lastStaticKey = staticKey;
    self.postMessage({ id: event.data.id, staticScene, dynamicScene });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : 'RenderScene compiler failed',
    });
  }
});
