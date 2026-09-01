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
let lastStaticContentKey: string | null = null;
let lastStaticCamera: { x: number; y: number; zoom: number } | null = null;
const STATIC_CACHE_OVERSCAN = 1.5;
const MAX_STATIC_CACHE_DIMENSION = 4096;

function staticContentKey(input: WorldRenderInput) {
  // Camera position is deliberately excluded. The existing oversized cache
  // remains correct until its real world-space coverage is exhausted.
  return JSON.stringify({
    viewport: [input.canvasWidth, input.canvasHeight],
    worldPois: input.worldPois ?? [],
    // Retained props redraw only when their observable state changes. Moving
    // cars belong to the dynamic mesh; including them here used to rebuild
    // the large static cache repeatedly during ordinary driving.
    occupancy: [input.localPlayer.interiorBuildingId ?? null, input.localPlayer.interiorFloor ?? 0],
    resourceNodes: input.resourceNodes.map((node) => [node.id, node.x, node.y, node.hp, node.type, node.scale]),
  });
}

function cameraFitsStaticCache(
  input: WorldRenderInput,
  camera: { x: number; y: number; zoom: number }
) {
  if (!lastStaticCamera) return false;
  const staticWidth = Math.min(MAX_STATIC_CACHE_DIMENSION, Math.ceil(input.canvasWidth * STATIC_CACHE_OVERSCAN));
  const staticHeight = Math.min(MAX_STATIC_CACHE_DIMENSION, Math.ceil(input.canvasHeight * STATIC_CACHE_OVERSCAN));
  const staticHalfWidth = staticWidth / lastStaticCamera.zoom / 2;
  const staticHalfHeight = staticHeight / lastStaticCamera.zoom / 2;
  const dynamicHalfWidth = input.canvasWidth / camera.zoom / 2;
  const dynamicHalfHeight = input.canvasHeight / camera.zoom / 2;
  return Math.abs(camera.x - lastStaticCamera.x) <= staticHalfWidth - dynamicHalfWidth
    && Math.abs(camera.y - lastStaticCamera.y) <= staticHalfHeight - dynamicHalfHeight;
}

function staticCacheInput(input: WorldRenderInput): WorldRenderInput {
  // The native backend stores this retained pass in a GPU texture. Compile a
  // margin around the visible frame so the compositor can move the camera
  // smoothly between retained-world refreshes instead of freezing the map.
  return {
    ...input,
    canvasWidth: Math.min(MAX_STATIC_CACHE_DIMENSION, Math.ceil(input.canvasWidth * STATIC_CACHE_OVERSCAN)),
    canvasHeight: Math.min(MAX_STATIC_CACHE_DIMENSION, Math.ceil(input.canvasHeight * STATIC_CACHE_OVERSCAN)),
  };
}

self.addEventListener('message', (event: MessageEvent<SceneCompileRequest>) => {
  if (!measurementContext) {
    self.postMessage({ id: event.data.id, error: 'OffscreenCanvas 2D is unavailable' });
    return;
  }
  try {
    const dynamicScene = compileDynamicWorldScene(measurementContext, event.data.input);
    const contentKey = staticContentKey(event.data.input);
    const staticScene = contentKey === lastStaticContentKey
      && cameraFitsStaticCache(event.data.input, dynamicScene.camera)
      ? undefined
      : compileStaticWorldScene(measurementContext, staticCacheInput(event.data.input), dynamicScene.camera);
    if (staticScene) {
      lastStaticContentKey = contentKey;
      lastStaticCamera = dynamicScene.camera;
    }
    self.postMessage({ id: event.data.id, staticScene, dynamicScene });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : 'RenderScene compiler failed',
    });
  }
});
