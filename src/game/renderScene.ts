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
  | { op: 'resourceCall'; ref: number; method: string; args: SceneValue[] };

export type RenderScene = {
  version: 1;
  viewport: { width: number; height: number };
  camera: { x: number; y: number; zoom: number };
  timeSeconds: number;
  commands: SceneCommand[];
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
