import type { Monster } from '../types/game';
import { getViewBounds, isInViewBounds } from './viewCull';
import {
  drawHordeMobAtlasSprite,
  getHordeMobAtlasSprites,
  getWebglHordeMobAtlasKey,
} from './worldRenderer';
import { getHordeBlindness, isInHordeArena } from './hordeMode';

type Camera = { x: number; y: number; zoom: number };

type AtlasSlot = {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
};

const CELL_SIZE = 128;
const ATLAS_COLUMNS = 4;
const SPRITE_WORLD_SIZE = 72;

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_atlas;
out vec4 out_color;
void main() {
  out_color = texture(u_atlas, v_uv);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL shader allocation failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const detail = gl.getShaderInfoLog(shader) ?? 'unknown shader error';
    gl.deleteShader(shader);
    throw new Error(detail);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL program allocation failed');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const detail = gl.getProgramInfoLog(program) ?? 'unknown program link error';
    gl.deleteProgram(program);
    throw new Error(detail);
  }
  return program;
}

/**
 * WebView hybrid renderer for the expensive, repeated horde body geometry.
 * It is intentionally a small isolated layer: Canvas retains all labels,
 * health bars, hit flashes, telegraphs, projectiles and screen effects.
 */
export class WebglHordeMobRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly texture: WebGLTexture;
  private readonly atlasSlots = new Map<string, AtlasSlot>();
  private readonly positionLocation: number;
  private readonly uvLocation: number;
  private lost = false;

  get isAvailable() {
    return !this.lost;
  }

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is unavailable');
    this.gl = gl;
    this.program = createProgram(gl);
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!buffer || !texture) throw new Error('WebGL atlas allocation failed');
    this.buffer = buffer;
    this.texture = texture;
    this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
    this.uvLocation = gl.getAttribLocation(this.program, 'a_uv');
    if (this.positionLocation < 0 || this.uvLocation < 0) throw new Error('WebGL atlas attributes unavailable');
    this.buildAtlas();
    canvas.addEventListener('webglcontextlost', this.onContextLost, false);
  }

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
  };

  private buildAtlas() {
    const sprites = getHordeMobAtlasSprites();
    const rows = Math.ceil(sprites.length / ATLAS_COLUMNS);
    const atlas = document.createElement('canvas');
    atlas.width = ATLAS_COLUMNS * CELL_SIZE;
    atlas.height = rows * CELL_SIZE;
    const context = atlas.getContext('2d');
    if (!context) throw new Error('Canvas2D atlas source unavailable');
    sprites.forEach((sprite, index) => {
      const column = index % ATLAS_COLUMNS;
      const row = Math.floor(index / ATLAS_COLUMNS);
      context.save();
      context.translate(column * CELL_SIZE + CELL_SIZE / 2, row * CELL_SIZE + CELL_SIZE / 2);
      // 2x source resolution keeps the texture crisp when the camera zooms.
      context.scale(2, 2);
      drawHordeMobAtlasSprite(context, sprite);
      context.restore();
      this.atlasSlots.set(`${sprite.kind}:${sprite.boss ? 1 : 0}`, {
        u0: (column * CELL_SIZE) / atlas.width,
        v0: (row * CELL_SIZE) / atlas.height,
        u1: ((column + 1) * CELL_SIZE) / atlas.width,
        v1: ((row + 1) * CELL_SIZE) / atlas.height,
      });
    });

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
  }

  clear() {
    if (this.lost) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  render(monsters: Monster[], localPlayer: Monster | { x: number; y: number }, camera: Camera) {
    if (this.lost) return 0;
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width < 1 || height < 1) return 0;
    const gl = this.gl;
    this.clear();

    const viewBounds = getViewBounds(camera.x, camera.y, width, height, camera.zoom);
    const blindness = getHordeBlindness();
    const blinded = isInHordeArena(localPlayer.x, localPlayer.y) && blindness.active && blindness.remaining > 0;
    const vertices: number[] = [];
    for (const monster of monsters) {
      if (monster.state === 'dead' || !isInViewBounds(monster.x, monster.y, viewBounds)) continue;
      if (blinded && monster.id !== blindness.casterId) continue;
      const key = getWebglHordeMobAtlasKey(monster);
      if (!key) continue;
      const slot = this.atlasSlots.get(key);
      if (!slot) continue;
      const kind = monster.hordeKind;
      const bodyScale = monster.isBoss ? 1.55 : kind === 'mite' ? 0.55 : 1;
      const halfSize = (SPRITE_WORLD_SIZE * bodyScale * camera.zoom) / 2;
      const centerX = width / 2 + (monster.x - camera.x) * camera.zoom;
      const centerY = height / 2 + (monster.y - camera.y) * camera.zoom;
      const left = (centerX - halfSize) * 2 / width - 1;
      const right = (centerX + halfSize) * 2 / width - 1;
      const top = 1 - (centerY - halfSize) * 2 / height;
      const bottom = 1 - (centerY + halfSize) * 2 / height;
      const flip = monster.facing === 'left';
      const u0 = flip ? slot.u1 : slot.u0;
      const u1 = flip ? slot.u0 : slot.u1;
      vertices.push(
        left, top, u0, slot.v0, right, top, u1, slot.v0, right, bottom, u1, slot.v1,
        left, top, u0, slot.v0, right, bottom, u1, slot.v1, left, bottom, u0, slot.v1,
      );
    }
    if (vertices.length === 0) return 0;

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.uvLocation);
    gl.vertexAttribPointer(this.uvLocation, 2, gl.FLOAT, false, 16, 8);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const sampler = gl.getUniformLocation(this.program, 'u_atlas');
    gl.uniform1i(sampler, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4);
    return vertices.length / 24;
  }

  destroy() {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost, false);
    if (!this.lost) {
      this.gl.deleteBuffer(this.buffer);
      this.gl.deleteTexture(this.texture);
      this.gl.deleteProgram(this.program);
    }
  }
}

export function createWebglHordeMobRenderer(canvas: HTMLCanvasElement) {
  try {
    return new WebglHordeMobRenderer(canvas);
  } catch {
    return null;
  }
}
