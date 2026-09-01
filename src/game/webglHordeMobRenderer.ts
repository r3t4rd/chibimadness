import type { Monster, Player, Projectile, VisualParticle } from '../types/game';
import { getViewBounds, isInViewBounds } from './viewCull';
import {
  drawHordeMobAtlasSprite,
  drawWebglMonsterAtlasSprite,
  drawWebglPlayerAtlasSprite,
  getHordeMobAtlasSprites,
  getWebglMonsterAtlasKey,
  getWebglPlayerAtlasKey,
  isWebglParticle,
  isWebglProjectile,
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
const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = 12;
const HORDE_SPRITE_WORLD_SIZE = 72;
const HUMANOID_SPRITE_WORLD_SIZE = 128;
const PLAYER_SPRITE_WORLD_SIZE = 144;

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
uniform float u_probe_solid;
uniform vec4 u_solid_color;
uniform vec4 u_tint;
out vec4 out_color;
void main() {
  out_color = mix(texture(u_atlas, v_uv) * u_tint, u_solid_color, u_probe_solid);
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

function colorToTint(color: string | undefined, alpha = 1): [number, number, number, number] {
  const hex = color?.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i)?.[1];
  if (!hex) return [1, 1, 1, alpha];
  const expanded = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  return [
    parseInt(expanded.slice(0, 2), 16) / 255,
    parseInt(expanded.slice(2, 4), 16) / 255,
    parseInt(expanded.slice(4, 6), 16) / 255,
    alpha,
  ];
}

/**
 * WebView hybrid renderer for repeated procedural actor geometry. It executes
 * each appearance once into a runtime atlas; the frame loop only submits GPU
 * quads. Canvas retains labels, hit flashes, telegraphs and screen effects.
 */
export class WebglHordeMobRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly texture: WebGLTexture;
  private readonly atlasCanvas: HTMLCanvasElement;
  private readonly atlasSlots = new Map<string, AtlasSlot>();
  private readonly positionLocation: number;
  private readonly uvLocation: number;
  private readonly solidColorLocation: WebGLUniformLocation | null;
  private readonly tintLocation: WebGLUniformLocation | null;
  private lost = false;
  private drawnMobCount = 0;
  private nextAtlasSlot = 0;

  get isAvailable() {
    return !this.lost;
  }

  get lastDrawnMobCount() {
    return this.drawnMobCount;
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
    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = ATLAS_COLUMNS * CELL_SIZE;
    this.atlasCanvas.height = ATLAS_ROWS * CELL_SIZE;
    this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
    this.uvLocation = gl.getAttribLocation(this.program, 'a_uv');
    this.solidColorLocation = gl.getUniformLocation(this.program, 'u_solid_color');
    this.tintLocation = gl.getUniformLocation(this.program, 'u_tint');
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
    const context = this.atlasCanvas.getContext('2d');
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
      this.atlasSlots.set(`horde:${sprite.kind}:${sprite.boss ? 1 : 0}`, {
        u0: (column * CELL_SIZE) / this.atlasCanvas.width,
        v0: (row * CELL_SIZE) / this.atlasCanvas.height,
        u1: ((column + 1) * CELL_SIZE) / this.atlasCanvas.width,
        v1: ((row + 1) * CELL_SIZE) / this.atlasCanvas.height,
      });
    });
    this.nextAtlasSlot = sprites.length;

    const registerFx = (key: string, draw: (source: CanvasRenderingContext2D) => void) => {
      const index = this.nextAtlasSlot++;
      const column = index % ATLAS_COLUMNS;
      const row = Math.floor(index / ATLAS_COLUMNS);
      const source = document.createElement('canvas');
      source.width = CELL_SIZE;
      source.height = CELL_SIZE;
      const sourceContext = source.getContext('2d');
      if (!sourceContext) return;
      draw(sourceContext);
      context.drawImage(source, column * CELL_SIZE, row * CELL_SIZE);
      this.atlasSlots.set(key, {
        u0: (column * CELL_SIZE) / this.atlasCanvas.width,
        v0: (row * CELL_SIZE) / this.atlasCanvas.height,
        u1: ((column + 1) * CELL_SIZE) / this.atlasCanvas.width,
        v1: ((row + 1) * CELL_SIZE) / this.atlasCanvas.height,
      });
    };
    registerFx('fx:soft', (source) => {
      const gradient = source.createRadialGradient(64, 64, 1, 64, 64, 56);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.36, 'rgba(255,255,255,0.92)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      source.fillStyle = gradient;
      source.fillRect(0, 0, CELL_SIZE, CELL_SIZE);
    });
    registerFx('fx:spark', (source) => {
      const gradient = source.createLinearGradient(8, 64, 120, 64);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.55, 'rgba(255,255,255,0.75)');
      gradient.addColorStop(1, 'rgba(255,255,255,1)');
      source.strokeStyle = gradient;
      source.lineWidth = 14;
      source.lineCap = 'round';
      source.beginPath();
      source.moveTo(10, 64);
      source.lineTo(118, 64);
      source.stroke();
    });

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlasCanvas);
  }

  /** Registers each ordinary humanoid appearance only once at runtime. */
  private ensureMonsterSprites(monsters: Monster[]) {
    const sourceContext = this.atlasCanvas.getContext('2d');
    if (!sourceContext) return;
    const gl = this.gl;
    for (const monster of monsters) {
      const key = getWebglMonsterAtlasKey(monster);
      if (!key || this.atlasSlots.has(key) || this.nextAtlasSlot >= ATLAS_COLUMNS * ATLAS_ROWS) continue;
      const index = this.nextAtlasSlot++;
      const column = index % ATLAS_COLUMNS;
      const row = Math.floor(index / ATLAS_COLUMNS);
      const source = document.createElement('canvas');
      source.width = CELL_SIZE;
      source.height = CELL_SIZE;
      const context = source.getContext('2d');
      if (!context) continue;
      context.translate(CELL_SIZE / 2, CELL_SIZE / 2);
      drawWebglMonsterAtlasSprite(context, monster);
      sourceContext.drawImage(source, column * CELL_SIZE, row * CELL_SIZE);
      this.atlasSlots.set(key, {
        u0: (column * CELL_SIZE) / this.atlasCanvas.width,
        v0: (row * CELL_SIZE) / this.atlasCanvas.height,
        u1: ((column + 1) * CELL_SIZE) / this.atlasCanvas.width,
        v1: ((row + 1) * CELL_SIZE) / this.atlasCanvas.height,
      });
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, column * CELL_SIZE, row * CELL_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
  }

  /** Registers a procedural player appearance only when it first appears. */
  private ensurePlayerSprites(players: Player[]) {
    const sourceContext = this.atlasCanvas.getContext('2d');
    if (!sourceContext) return;
    const gl = this.gl;
    for (const player of players) {
      const key = getWebglPlayerAtlasKey(player);
      if (!key || this.atlasSlots.has(key) || this.nextAtlasSlot >= ATLAS_COLUMNS * ATLAS_ROWS) continue;
      const index = this.nextAtlasSlot++;
      const column = index % ATLAS_COLUMNS;
      const row = Math.floor(index / ATLAS_COLUMNS);
      const source = document.createElement('canvas');
      source.width = CELL_SIZE;
      source.height = CELL_SIZE;
      const context = source.getContext('2d');
      if (!context) continue;
      context.translate(CELL_SIZE / 2, CELL_SIZE / 2);
      drawWebglPlayerAtlasSprite(context, player);
      sourceContext.drawImage(source, column * CELL_SIZE, row * CELL_SIZE);
      this.atlasSlots.set(key, {
        u0: (column * CELL_SIZE) / this.atlasCanvas.width,
        v0: (row * CELL_SIZE) / this.atlasCanvas.height,
        u1: ((column + 1) * CELL_SIZE) / this.atlasCanvas.width,
        v1: ((row + 1) * CELL_SIZE) / this.atlasCanvas.height,
      });
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, column * CELL_SIZE, row * CELL_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
  }

  private getPlayerLabelKey(player: Player) {
    return `label:${player.id}:${player.name}:${player.stats?.level ?? 1}`;
  }

  /** Text is rasterized only when its contents change, then moves as a quad. */
  private ensurePlayerLabelSprites(players: Player[]) {
    const sourceContext = this.atlasCanvas.getContext('2d');
    if (!sourceContext) return;
    const gl = this.gl;
    for (const player of players) {
      if (!getWebglPlayerAtlasKey(player)) continue;
      const key = this.getPlayerLabelKey(player);
      if (this.atlasSlots.has(key) || this.nextAtlasSlot >= ATLAS_COLUMNS * ATLAS_ROWS) continue;
      const index = this.nextAtlasSlot++;
      const column = index % ATLAS_COLUMNS;
      const row = Math.floor(index / ATLAS_COLUMNS);
      const source = document.createElement('canvas');
      source.width = CELL_SIZE;
      source.height = CELL_SIZE;
      const context = source.getContext('2d');
      if (!context) continue;
      const level = player.stats?.level ?? 1;
      const levelText = `Lv.${level}`;
      const nameText = player.name || 'Hero';
      context.font = 'bold 11px system-ui, -apple-system, sans-serif';
      const totalWidth = Math.min(CELL_SIZE - 6, context.measureText(levelText).width + context.measureText(nameText).width + 18);
      const x = (CELL_SIZE - totalWidth) / 2;
      const y = (CELL_SIZE - 18) / 2;
      context.fillStyle = 'rgba(15, 23, 42, 0.82)';
      context.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      context.lineWidth = 1;
      context.beginPath();
      context.roundRect(x, y, totalWidth, 18, 9);
      context.fill();
      context.stroke();
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = '#FDE047';
      context.fillText(levelText, x + Math.min(20, totalWidth * 0.25), y + 9);
      context.fillStyle = '#FFFFFF';
      context.fillText(nameText, x + totalWidth * 0.62, y + 9, Math.max(8, totalWidth * 0.68));
      sourceContext.drawImage(source, column * CELL_SIZE, row * CELL_SIZE);
      this.atlasSlots.set(key, {
        u0: (column * CELL_SIZE) / this.atlasCanvas.width,
        v0: (row * CELL_SIZE) / this.atlasCanvas.height,
        u1: ((column + 1) * CELL_SIZE) / this.atlasCanvas.width,
        v1: ((row + 1) * CELL_SIZE) / this.atlasCanvas.height,
      });
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, column * CELL_SIZE, row * CELL_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
  }

  clear() {
    if (this.lost) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private drawVertices(
    vertices: number[],
    solidColor?: readonly [number, number, number, number],
    tint: readonly [number, number, number, number] = [1, 1, 1, 1],
  ) {
    if (vertices.length === 0) return 0;
    const gl = this.gl;
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
    const probeSolidUniform = gl.getUniformLocation(this.program, 'u_probe_solid');
    gl.uniform1f(probeSolidUniform, solidColor ? 1 : 0);
    if (solidColor) gl.uniform4f(this.solidColorLocation, ...solidColor);
    gl.uniform4f(this.tintLocation, ...tint);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4);
    return vertices.length / 24;
  }

  render(
    monsters: Monster[],
    localPlayer: Player,
    camera: Camera,
    remotePlayers: Record<string, Player>,
    projectiles: Projectile[],
    particles: VisualParticle[],
  ) {
    this.drawnMobCount = 0;
    if (this.lost) return 0;
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width < 1 || height < 1) return 0;
    const gl = this.gl;
    this.clear();

    const viewBounds = getViewBounds(camera.x, camera.y, width, height, camera.zoom);
    const blindness = getHordeBlindness();
    const blinded = isInHordeArena(localPlayer.x, localPlayer.y) && blindness.active && blindness.remaining > 0;
    this.ensureMonsterSprites(monsters);
    const players = Object.values(remotePlayers);
    if (!remotePlayers[localPlayer.id]) players.push(localPlayer);
    this.ensurePlayerSprites(players);
    this.ensurePlayerLabelSprites(players);
    const vertices: number[] = [];
    const healthBackground: number[] = [];
    const healthCyan: number[] = [];
    const healthRed: number[] = [];
    const healthGreen: number[] = [];
    const healthYellow: number[] = [];
    const labels: number[] = [];
    const fxBatches = new Map<string, {
      vertices: number[];
      tint: [number, number, number, number];
    }>();
    const appendQuad = (
      target: number[],
      centerX: number,
      centerY: number,
      quadWidth: number,
      quadHeight: number,
      slot?: AtlasSlot,
    ) => {
      const left = (centerX - quadWidth / 2) * 2 / width - 1;
      const right = (centerX + quadWidth / 2) * 2 / width - 1;
      const top = 1 - (centerY - quadHeight / 2) * 2 / height;
      const bottom = 1 - (centerY + quadHeight / 2) * 2 / height;
      const u0 = slot?.u0 ?? 0;
      const v0 = slot?.v0 ?? 0;
      const u1 = slot?.u1 ?? 0;
      const v1 = slot?.v1 ?? 0;
      target.push(
        left, top, u0, v0, right, top, u1, v0, right, bottom, u1, v1,
        left, top, u0, v0, right, bottom, u1, v1, left, bottom, u0, v1,
      );
    };
    const appendHealthBar = (
      foreground: number[],
      centerX: number,
      centerY: number,
      barWidth: number,
      barHeight: number,
      ratio: number,
    ) => {
      const safeRatio = Math.max(0, Math.min(1, ratio));
      appendQuad(healthBackground, centerX, centerY, barWidth + 2, barHeight + 2);
      if (safeRatio > 0) {
        appendQuad(
          foreground,
          centerX - (barWidth * (1 - safeRatio)) / 2,
          centerY,
          barWidth * safeRatio,
          barHeight,
        );
      }
    };
    const appendWorldQuad = (
      target: number[],
      worldX: number,
      worldY: number,
      worldWidth: number,
      worldHeight: number,
      angle: number,
      slot: AtlasSlot,
    ) => {
      const centerX = width / 2 + (worldX - camera.x) * camera.zoom;
      const centerY = height / 2 + (worldY - camera.y) * camera.zoom;
      const halfWidth = worldWidth * camera.zoom / 2;
      const halfHeight = worldHeight * camera.zoom / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const point = (x: number, y: number) => {
        const px = centerX + x * cos - y * sin;
        const py = centerY + x * sin + y * cos;
        return [px * 2 / width - 1, 1 - py * 2 / height] as const;
      };
      const topLeft = point(-halfWidth, -halfHeight);
      const topRight = point(halfWidth, -halfHeight);
      const bottomRight = point(halfWidth, halfHeight);
      const bottomLeft = point(-halfWidth, halfHeight);
      target.push(
        topLeft[0], topLeft[1], slot.u0, slot.v0,
        topRight[0], topRight[1], slot.u1, slot.v0,
        bottomRight[0], bottomRight[1], slot.u1, slot.v1,
        topLeft[0], topLeft[1], slot.u0, slot.v0,
        bottomRight[0], bottomRight[1], slot.u1, slot.v1,
        bottomLeft[0], bottomLeft[1], slot.u0, slot.v1,
      );
    };
    const appendFx = (
      slotKey: string,
      color: string | undefined,
      alpha: number,
      worldX: number,
      worldY: number,
      worldWidth: number,
      worldHeight: number,
      angle: number,
    ) => {
      const slot = this.atlasSlots.get(slotKey);
      if (!slot) return;
      const quantizedAlpha = Math.max(0, Math.min(1, Math.round(alpha * 10) / 10));
      const tint = colorToTint(color, quantizedAlpha);
      const key = `${slotKey}:${tint.join(':')}`;
      let batch = fxBatches.get(key);
      if (!batch) {
        batch = { vertices: [], tint };
        fxBatches.set(key, batch);
      }
      appendWorldQuad(batch.vertices, worldX, worldY, worldWidth, worldHeight, angle, slot);
    };
    for (const monster of monsters) {
      if (monster.state === 'dead' || !isInViewBounds(monster.x, monster.y, viewBounds)) continue;
      if (blinded && monster.id !== blindness.casterId) continue;
      const key = getWebglMonsterAtlasKey(monster);
      if (!key) continue;
      const slot = this.atlasSlots.get(key);
      if (!slot) continue;
      const kind = monster.hordeKind;
      const bodyScale = kind ? (monster.isBoss ? 1.55 : kind === 'mite' ? 0.55 : 1) : 1;
      const spriteWorldSize = kind ? HORDE_SPRITE_WORLD_SIZE : HUMANOID_SPRITE_WORLD_SIZE;
      const halfSize = (spriteWorldSize * bodyScale * camera.zoom) / 2;
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
      if (monster.hp > 0) {
        const boss = Boolean(monster.isBoss);
        const barWidth = (boss ? 54 : 36) * camera.zoom;
        const barHeight = 5 * camera.zoom;
        const barY = centerY + (boss ? -48 : -34) * camera.zoom + barHeight / 2;
        appendHealthBar(
          boss ? healthRed : healthCyan,
          centerX,
          barY,
          barWidth,
          barHeight,
          monster.hp / Math.max(1, monster.maxHp),
        );
      }
    }
    for (const player of players) {
      if (player.state === 'dead' || !isInViewBounds(player.x, player.y, viewBounds)) continue;
      const key = getWebglPlayerAtlasKey(player);
      const slot = key ? this.atlasSlots.get(key) : undefined;
      if (!slot) continue;
      const halfSize = (PLAYER_SPRITE_WORLD_SIZE * camera.zoom) / 2;
      const centerX = width / 2 + (player.x - camera.x) * camera.zoom;
      const centerY = height / 2 + (player.y - camera.y) * camera.zoom;
      const left = (centerX - halfSize) * 2 / width - 1;
      const right = (centerX + halfSize) * 2 / width - 1;
      const top = 1 - (centerY - halfSize) * 2 / height;
      const bottom = 1 - (centerY + halfSize) * 2 / height;
      const flip = player.facing === 'left';
      const u0 = flip ? slot.u1 : slot.u0;
      const u1 = flip ? slot.u0 : slot.u1;
      vertices.push(
        left, top, u0, slot.v0, right, top, u1, slot.v0, right, bottom, u1, slot.v1,
        left, top, u0, slot.v0, right, bottom, u1, slot.v1, left, bottom, u0, slot.v1,
      );
      const hp = player.stats?.hp ?? 100;
      const maxHp = Math.max(1, player.stats?.maxHp ?? 100);
      const hpRatio = hp / maxHp;
      const healthTarget = hpRatio > 0.5 ? healthGreen : hpRatio > 0.25 ? healthYellow : healthRed;
      appendHealthBar(
        healthTarget,
        centerX,
        centerY - 76 * camera.zoom + (5 * camera.zoom) / 2,
        48 * camera.zoom,
        5 * camera.zoom,
        hpRatio,
      );
      const stamina = player.stamina ?? 100;
      const maxStamina = Math.max(1, player.maxStamina ?? 100);
      if (stamina < maxStamina || player.isSprinting) {
        appendHealthBar(
          healthCyan,
          centerX,
          centerY - 69 * camera.zoom + (2.5 * camera.zoom) / 2,
          48 * camera.zoom,
          2.5 * camera.zoom,
          stamina / maxStamina,
        );
      }
      const labelSlot = this.atlasSlots.get(this.getPlayerLabelKey(player));
      if (labelSlot) appendQuad(labels, centerX, centerY - 89 * camera.zoom, 128 * camera.zoom, 32 * camera.zoom, labelSlot);
    }
    for (const projectile of projectiles) {
      if (!isWebglProjectile(projectile) || !isInViewBounds(projectile.x, projectile.y, viewBounds)) continue;
      const angle = Math.atan2(projectile.vy, projectile.vx);
      const trailLength = projectile.tracerLength ?? 18;
      const trailWidth = Math.max(1.5, projectile.tracerWidth ?? 2);
      const launchOffset = (projectile.visualOffsetY ?? 0) * Math.max(0, 1 - projectile.distanceTraveled / 260);
      appendFx(
        'fx:spark',
        projectile.color || '#FDE047',
        1,
        projectile.x + Math.cos(angle) * (6 - trailLength) / 2,
        projectile.y + launchOffset + Math.sin(angle) * (6 - trailLength) / 2,
        trailLength + 6,
        trailWidth * 2.6,
        angle,
      );
    }
    for (const particle of particles) {
      if (!isWebglParticle(particle) || !isInViewBounds(particle.x, particle.y, viewBounds)) continue;
      if (particle.shape === 'spark') {
        const angle = Math.atan2(particle.vy, particle.vx);
        appendFx('fx:spark', particle.color, particle.alpha, particle.x, particle.y, particle.size * 3.4, Math.max(1, particle.size * 0.75), angle);
      } else {
        appendFx('fx:soft', particle.color, particle.alpha, particle.x, particle.y, particle.size * 2.2, particle.size * 2.2, 0);
      }
    }
    this.drawnMobCount = this.drawVertices(vertices);
    this.drawVertices(healthBackground, [0.06, 0.09, 0.16, 0.82]);
    this.drawVertices(healthCyan, [0.13, 0.83, 0.95, 1]);
    this.drawVertices(healthRed, [0.94, 0.27, 0.27, 1]);
    this.drawVertices(healthGreen, [0.06, 0.72, 0.51, 1]);
    this.drawVertices(healthYellow, [0.96, 0.62, 0.16, 1]);
    this.drawVertices(labels);
    for (const batch of fxBatches.values()) this.drawVertices(batch.vertices, undefined, batch.tint);
    return this.drawnMobCount;
  }

  /**
   * F8 diagnostic fallback when the current scene has no atlas-compatible
   * horde mobs. This keeps the probe a real changing WebGL frame instead of
   * accidentally measuring an empty canvas/rAF-only path.
   */
  renderCalibrationGrid() {
    if (this.lost) return 0;
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width < 1 || height < 1) return 0;
    this.clear();
    const slots = [...this.atlasSlots.values()];
    const columns = 8;
    const rows = 5;
    const cell = Math.min(88, Math.max(42, Math.floor(Math.min(width / (columns + 2), height / (rows + 2)))));
    const originX = (width - columns * cell) / 2;
    const originY = (height - rows * cell) / 2;
    const vertices: number[] = [];
    for (let index = 0; index < columns * rows; index += 1) {
      const slot = slots[index % slots.length];
      const column = index % columns;
      const row = Math.floor(index / columns);
      const leftPx = originX + column * cell + 8;
      const rightPx = leftPx + cell - 16;
      const topPx = originY + row * cell + 8;
      const bottomPx = topPx + cell - 16;
      const left = leftPx * 2 / width - 1;
      const right = rightPx * 2 / width - 1;
      const top = 1 - topPx * 2 / height;
      const bottom = 1 - bottomPx * 2 / height;
      vertices.push(
        left, top, slot.u0, slot.v0, right, top, slot.u1, slot.v0, right, bottom, slot.u1, slot.v1,
        left, top, slot.u0, slot.v0, right, bottom, slot.u1, slot.v1, left, bottom, slot.u0, slot.v1,
      );
    }
    return this.drawVertices(vertices, [0.15, 1, 0.3, 1]);
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
