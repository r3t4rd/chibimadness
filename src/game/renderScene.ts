/**
 * Canonical 2D display list for the world renderer.
 *
 * Canvas2D is currently the source-of-truth backend. Recording its commands
 * while it paints gives every later backend (WGPU included) the exact same
 * ordering, transforms, paths, gradients and state changes. This is
 * deliberately lower-level than game entities: an entity protocol loses the
 * visual decisions that made the old native renderer look unrelated.
 */

export type SceneScalar = number | string | boolean | null;
export type SceneValue = SceneScalar | SceneValue[] | SceneResourceRef | SceneObject;
export type SceneResourceKind = 'gradient' | 'pattern' | 'image';
export type SceneResourceRef = { ref: number; kind: SceneResourceKind };
export interface SceneObject {
  [key: string]: SceneValue;
}

export type SceneCommand =
  | { op: 'set'; property: string; value: SceneValue }
  | { op: 'call'; method: string; args: SceneValue[]; result?: { ref: number; kind: SceneResourceKind } }
  | { op: 'resourceCall'; ref: number; method: string; args: SceneValue[] }
  | { op: 'layer'; name: 'screen' | 'static' | 'dynamic' };

export type RenderScene = {
  version: 1;
  viewport: { width: number; height: number };
  camera: { x: number; y: number; zoom: number };
  timeSeconds: number;
  commands: SceneCommand[];
};

export type SceneReplayResult = {
  appliedCommands: number;
  unsupportedCommands: SceneCommand[];
};

export type RenderSceneLayers = {
  /** Background plus world geometry that is retained by the native surface. */
  staticScene: RenderScene;
  /** State-only preamble followed by actors, projectiles and time-varying FX. */
  dynamicScene: RenderScene;
};

type ResourceTarget = CanvasGradient | CanvasPattern | CanvasImageSource;

function isCanvasResource(value: unknown): value is ResourceTarget {
  return typeof value === 'object' && value !== null && (
    (typeof CanvasGradient !== 'undefined' && value instanceof CanvasGradient)
    || (typeof CanvasPattern !== 'undefined' && value instanceof CanvasPattern)
    || (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap)
  );
}

function resourceKind(value: ResourceTarget): SceneResourceKind {
  if (typeof CanvasGradient !== 'undefined' && value instanceof CanvasGradient) return 'gradient';
  if (typeof CanvasPattern !== 'undefined' && value instanceof CanvasPattern) return 'pattern';
  return 'image';
}

/**
 * Serializes only deterministic Canvas arguments. Unknown browser objects are
 * represented as a bounded marker rather than leaking arbitrary host objects
 * into the bridge payload.
 */
function encodeValue(
  value: unknown,
  resourceIds: WeakMap<object, number>,
  proxyTargets: WeakMap<object, object>
): SceneValue {
  const target = typeof value === 'object' && value !== null ? proxyTargets.get(value) ?? value : value;
  if (target === null) return null;
  if (typeof target === 'string' || typeof target === 'boolean') return target;
  if (typeof target === 'number') return Number.isFinite(target) ? target : null;
  if (Array.isArray(target)) return target.map((entry) => encodeValue(entry, resourceIds, proxyTargets));
  if (isCanvasResource(target)) {
    const ref = resourceIds.get(target) ?? 0;
    return { ref, kind: resourceKind(target) };
  }
  if (typeof target === 'object') {
    const result: Record<string, SceneValue> = {};
    for (const [key, entry] of Object.entries(target as Record<string, unknown>).slice(0, 24)) {
      if (typeof entry !== 'function') result[key] = encodeValue(entry, resourceIds, proxyTargets);
    }
    return result;
  }
  return null;
}

function unwrap<T>(value: T, proxyTargets: WeakMap<object, object>): T {
  if (typeof value === 'object' && value !== null) {
    return (proxyTargets.get(value) as T | undefined) ?? value;
  }
  return value;
}

/**
 * Runs the existing Canvas renderer unchanged and records an equivalent,
 * serializable display list. It is intentionally opt-in: production Canvas
 * rendering keeps zero recorder overhead until a native backend requests it.
 */
export function recordRenderScene<T>(
  context: CanvasRenderingContext2D,
  metadata: Omit<RenderScene, 'version' | 'commands'>,
  paint: (context: CanvasRenderingContext2D) => T
): { result: T; scene: RenderScene } {
  const commands: SceneCommand[] = [];
  const resourceIds = new WeakMap<object, number>();
  const proxyTargets = new WeakMap<object, object>();
  let nextResourceId = 1;

  const getResourceRef = (target: ResourceTarget) => {
    const known = resourceIds.get(target);
    if (known !== undefined) return known;
    const ref = nextResourceId++;
    resourceIds.set(target, ref);
    return ref;
  };

  const resourceProxy = <TResource extends ResourceTarget>(target: TResource): TResource => {
    const ref = getResourceRef(target);
    const proxy = new Proxy(target as object, {
      get(resource, property, receiver) {
        const value = Reflect.get(resource, property, resource);
        if (typeof value !== 'function') return Reflect.get(resource, property, receiver);
        return (...args: unknown[]) => {
          commands.push({
            op: 'resourceCall',
            ref,
            method: String(property),
            args: args.map((arg) => encodeValue(arg, resourceIds, proxyTargets)),
          });
          return Reflect.apply(value, resource, args.map((arg) => unwrap(arg, proxyTargets)));
        };
      },
    });
    proxyTargets.set(proxy, target);
    return proxy as TResource;
  };

  const proxy = new Proxy(context, {
    get(target, property, receiver) {
      if (property === '__renderSceneLayer') {
        return (name: 'screen' | 'static' | 'dynamic') => commands.push({ op: 'layer', name });
      }
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return Reflect.get(target, property, receiver);
      return (...args: unknown[]) => {
        const rawArgs = args.map((arg) => unwrap(arg, proxyTargets));
        const result = Reflect.apply(value, target, rawArgs);
        const command: Extract<SceneCommand, { op: 'call' }> = {
          op: 'call',
          method: String(property),
          args: args.map((arg) => encodeValue(arg, resourceIds, proxyTargets)),
        };
        if (isCanvasResource(result)) {
          const ref = getResourceRef(result);
          command.result = { ref, kind: resourceKind(result) };
          commands.push(command);
          return resourceProxy(result);
        }
        commands.push(command);
        return result;
      };
    },
    set(target, property, value) {
      commands.push({
        op: 'set',
        property: String(property),
        value: encodeValue(value, resourceIds, proxyTargets),
      });
      return Reflect.set(target, property, unwrap(value, proxyTargets), target);
    },
  });

  const result = paint(proxy as CanvasRenderingContext2D);
  return {
    result,
    scene: { version: 1, ...metadata, commands },
  };
}

function isSceneResourceRef(value: SceneValue): value is SceneResourceRef {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && 'ref' in value
    && 'kind' in value
    && typeof value.ref === 'number';
}

function decodeValue(value: SceneValue, resources: Map<number, ResourceTarget>): unknown {
  if (Array.isArray(value)) return value.map((entry) => decodeValue(entry, resources));
  if (isSceneResourceRef(value)) return resources.get(value.ref) ?? null;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decodeValue(entry, resources)]));
  }
  return value;
}

/**
 * Reference executor used for visual conformance testing.  It lets us compare
 * a recorded scene with the original Canvas renderer before a WGPU operation
 * is declared supported.  The WGPU executor will consume this same contract,
 * not a second hand-authored world approximation.
 */
export function replayRenderScene(
  context: CanvasRenderingContext2D,
  scene: RenderScene
): SceneReplayResult {
  const resources = new Map<number, ResourceTarget>();
  const unsupportedCommands: SceneCommand[] = [];
  let appliedCommands = 0;

  for (const command of scene.commands) {
    try {
      if (command.op === 'set') {
        (context as unknown as Record<string, unknown>)[command.property] = decodeValue(command.value, resources);
      } else if (command.op === 'resourceCall') {
        const resource = resources.get(command.ref);
        const method = resource && (resource as unknown as Record<string, unknown>)[command.method];
        if (typeof method !== 'function') throw new Error('Unknown Canvas resource method');
        Reflect.apply(method, resource, command.args.map((arg) => decodeValue(arg, resources)));
      } else if (command.op === 'call') {
        const method = (context as unknown as Record<string, unknown>)[command.method];
        if (typeof method !== 'function') throw new Error('Unknown Canvas method');
        const result = Reflect.apply(method, context, command.args.map((arg) => decodeValue(arg, resources)));
        if (command.result && isCanvasResource(result)) resources.set(command.result.ref, result);
      } else {
        // Layer markers are retained-renderer metadata, not Canvas APIs.
        // A web replay deliberately treats them as no-ops.
      }
      appliedCommands += 1;
    } catch {
      // Keep the reference executor diagnostic-only: one unsupported future
      // Canvas API must not hide every later visual discrepancy.
      unsupportedCommands.push(command);
    }
  }
  return { appliedCommands, unsupportedCommands };
}

const STATE_ONLY_CANVAS_CALLS = new Set([
  'save', 'restore', 'translate', 'rotate', 'scale', 'transform', 'setTransform', 'resetTransform',
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo',
  'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'clip', 'setLineDash',
  'createLinearGradient', 'createRadialGradient', 'createPattern',
]);

/**
 * Turns one canonical draw list into independently executable retained layers.
 *
 * The dynamic layer receives only the Canvas state/path/resource preamble it
 * needs. Replaying prior visual calls here would paint the static world a
 * second time and defeat the retained GPU buffer.
 */
export function splitRenderScene(scene: RenderScene): RenderSceneLayers {
  const dynamicStart = scene.commands.findIndex(
    (command) => command.op === 'layer' && command.name === 'dynamic'
  );
  if (dynamicStart === -1) {
    return {
      staticScene: scene,
      dynamicScene: { ...scene, commands: [] },
    };
  }

  const staticCommands = scene.commands.slice(0, dynamicStart);
  const dynamicPreamble = staticCommands.filter((command) => {
    if (command.op === 'set' || command.op === 'resourceCall') return true;
    return command.op === 'call' && STATE_ONLY_CANVAS_CALLS.has(command.method);
  });

  return {
    staticScene: { ...scene, commands: staticCommands },
    dynamicScene: {
      ...scene,
      commands: [
        ...dynamicPreamble,
        { op: 'layer', name: 'dynamic' },
        ...scene.commands.slice(dynamicStart + 1),
      ],
    },
  };
}

type VirtualSceneResource = {
  ref: number;
  kind: SceneResourceKind;
};

type TextMeasurementContext = Pick<CanvasRenderingContext2D, 'font' | 'measureText'>;

/**
 * Compiles the established Canvas renderer into a display list without asking
 * Canvas to rasterize a single world primitive.  `measureText` is delegated
 * to a small real context because label layout is gameplay-visible; every
 * drawing call is recorded only.  This is the native production path, while
 * `recordRenderScene` remains the pixel-reference path used for conformance.
 */
export function compileRenderScene<T>(
  measurementContext: TextMeasurementContext,
  metadata: Omit<RenderScene, 'version' | 'commands'>,
  paint: (context: CanvasRenderingContext2D) => T
): { result: T; scene: RenderScene } {
  const commands: SceneCommand[] = [];
  const state: Record<string, unknown> = {
    font: measurementContext.font,
    globalAlpha: 1,
  };
  const stateStack: Array<Record<string, unknown>> = [];
  const resources = new WeakMap<object, VirtualSceneResource>();
  let nextResourceId = 1;

  const encode = (value: unknown): SceneValue => {
    if (value === null) return null;
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.map(encode);
    if (typeof value === 'object') {
      const resource = resources.get(value);
      if (resource) return { ref: resource.ref, kind: resource.kind };
      const result: SceneObject = {};
      for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 24)) {
        if (typeof entry !== 'function') result[key] = encode(entry);
      }
      return result;
    }
    return null;
  };

  const createResource = (kind: SceneResourceKind): CanvasGradient => {
    const resource = {} as CanvasGradient;
    const descriptor = { ref: nextResourceId++, kind };
    resources.set(resource, descriptor);
    const proxy = new Proxy(resource as object, {
      get(_target, property) {
        if (property === 'addColorStop') {
          return (...args: unknown[]) => {
            commands.push({
              op: 'resourceCall',
              ref: descriptor.ref,
              method: 'addColorStop',
              args: args.map(encode),
            });
          };
        }
        return undefined;
      },
    }) as CanvasGradient;
    resources.set(proxy, descriptor);
    return proxy;
  };

  const context = new Proxy(state, {
    get(_target, property) {
      const method = String(property);
      if (method === '__renderSceneLayer') {
        return (name: 'screen' | 'static' | 'dynamic') => commands.push({ op: 'layer', name });
      }
      // Canvas state is occasionally read and combined (for example
      // `ctx.globalAlpha *= fade`). Preserve it in the compiler instead of
      // accidentally treating a state property as a drawing method.
      if (method in state) return state[method];
      if (method === 'measureText') {
        return (text: string) => {
          measurementContext.font = typeof state.font === 'string' ? state.font : measurementContext.font;
          return measurementContext.measureText(text);
        };
      }
      if (method === 'save') {
        return () => {
          stateStack.push({ ...state });
          commands.push({ op: 'call', method, args: [] });
        };
      }
      if (method === 'restore') {
        return () => {
          const previous = stateStack.pop();
          if (previous) {
            for (const key of Object.keys(state)) delete state[key];
            Object.assign(state, previous);
          }
          commands.push({ op: 'call', method, args: [] });
        };
      }
      if (method === 'createLinearGradient' || method === 'createRadialGradient') {
        return (...args: unknown[]) => {
          const kind: SceneResourceKind = 'gradient';
          const result = createResource(kind);
          const descriptor = resources.get(result)!;
          commands.push({ op: 'call', method, args: args.map(encode), result: descriptor });
          return result;
        };
      }
      return (...args: unknown[]) => commands.push({ op: 'call', method, args: args.map(encode) });
    },
    set(_target, property, value) {
      const key = String(property);
      state[key] = value;
      commands.push({ op: 'set', property: key, value: encode(value) });
      return true;
    },
  });

  const result = paint(context as unknown as CanvasRenderingContext2D);
  return {
    result,
    scene: { version: 1, ...metadata, commands },
  };
}
