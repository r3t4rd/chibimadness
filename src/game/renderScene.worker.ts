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
const STATIC_CACHE_OVERSCAN = 1.5;
const MAX_STATIC_CACHE_DIMENSION = 4096;

function staticSceneKey(input: WorldRenderInput, camera: { x: number; y: number; zoom: number }) {
  // Source world culling is camera-relative. Refresh the retained mesh only
  // when the camera crosses a generous tile, the viewport changes, or POIs
  // (the only static input that can be authored at runtime) change.
  return JSON.stringify({
    viewport: [input.canvasWidth, input.canvasHeight],
    cameraTile: [Math.floor(camera.x / 640), Math.floor(camera.y / 640), Math.round(camera.zoom * 20)],
    worldPois: input.worldPois ?? [],
    // Retained props redraw only when their observable state changes. This
    // keeps destroyed nodes/cars visually correct without putting all of
    // their geometry back into the combat-rate dynamic mesh.
    occupancy: [input.localPlayer.interiorBuildingId ?? null, input.localPlayer.interiorFloor ?? 0],
    resourceNodes: input.resourceNodes.map((node) => [node.id, node.x, node.y, node.hp, node.type, node.scale]),
    cars: input.cars?.filter((car) => car.state !== 'player_driven').map((car) => [car.id, car.x, car.y, car.facing, car.state]) ?? [],
  });
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
    const staticKey = staticSceneKey(event.data.input, dynamicScene.camera);
    const staticScene = staticKey === lastStaticKey
      ? undefined
      : compileStaticWorldScene(measurementContext, staticCacheInput(event.data.input), dynamicScene.camera);
    lastStaticKey = staticKey;
    self.postMessage({ id: event.data.id, staticScene, dynamicScene });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : 'RenderScene compiler failed',
    });
  }
});
