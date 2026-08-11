/**
 * Minecraft 皮肤 3D 渲染器 — blessing/texture-renderer 的 TypeScript 移植。
 * 原算法: supermamie → cajogos → Gyzie → GPlane (BSD-3-Clause),
 * 由 PHP/GD 移植为纯 JS (fast-png 像素操作),兼容 workerd。
 *
 * 对应类: SkinRenderer / CapeRenderer / Point / Polygon / Minecraft
 */

export interface RGBAImage {
  width: number;
  height: number;
  /** RGBA 每像素 4 字节 */
  data: Uint8Array;
}

// ---------- Point ----------

class Point {
  originCoord: { x: number; y: number; z: number };
  destCoord: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  isProjected = false;
  isPreProjected = false;

  constructor(coord: { x?: number; y?: number; z?: number }) {
    this.originCoord = {
      x: coord.x ?? 0,
      y: coord.y ?? 0,
      z: coord.z ?? 0,
    };
  }

  project(
    cosAlpha: number, sinAlpha: number, cosOmega: number, sinOmega: number,
    bounds: Bounds,
  ): void {
    const { x, y, z } = this.originCoord;
    this.destCoord.x = x * cosOmega + z * sinOmega;
    this.destCoord.y = x * sinAlpha * sinOmega + y * cosAlpha - z * sinAlpha * cosOmega;
    this.destCoord.z = -x * cosAlpha * sinOmega + y * sinAlpha + z * cosAlpha * cosOmega;
    this.isProjected = true;
    bounds.minX = Math.min(bounds.minX, this.destCoord.x);
    bounds.maxX = Math.max(bounds.maxX, this.destCoord.x);
    bounds.minY = Math.min(bounds.minY, this.destCoord.y);
    bounds.maxY = Math.max(bounds.maxY, this.destCoord.y);
  }

  preProject(
    dx: number, dy: number, dz: number,
    cosAlpha: number, sinAlpha: number, cosOmega: number, sinOmega: number,
  ): void {
    if (!this.isPreProjected) {
      const x = this.originCoord.x - dx;
      const y = this.originCoord.y - dy;
      const z = this.originCoord.z - dz;
      this.originCoord.x = x * cosOmega + z * sinOmega + dx;
      this.originCoord.y = x * sinAlpha * sinOmega + y * cosAlpha - z * sinAlpha * cosOmega + dy;
      this.originCoord.z = -x * cosAlpha * sinOmega + y * sinAlpha + z * cosAlpha * cosOmega + dz;
      this.isPreProjected = true;
    }
  }

  getDepth(
    cosAlpha: number, sinAlpha: number, cosOmega: number, sinOmega: number,
    bounds: Bounds,
  ): number {
    if (!this.isProjected) {
      this.project(cosAlpha, sinAlpha, cosOmega, sinOmega, bounds);
    }
    return this.destCoord.z;
  }
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// ---------- Polygon ----------

interface PixelColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

class Polygon {
  dots: Point[];
  color: PixelColor;
  isProjected = false;

  constructor(dots: Point[], color: PixelColor) {
    this.dots = dots;
    this.color = color;
  }

  project(
    cosAlpha: number, sinAlpha: number, cosOmega: number, sinOmega: number,
    bounds: Bounds,
  ): void {
    for (const dot of this.dots) {
      if (!dot.isProjected) {
        dot.project(cosAlpha, sinAlpha, cosOmega, sinOmega, bounds);
      }
    }
    this.isProjected = true;
  }

  preProject(
    dx: number, dy: number, dz: number,
    cosAlpha: number, sinAlpha: number, cosOmega: number, sinOmega: number,
  ): void {
    for (const dot of this.dots) {
      dot.preProject(dx, dy, dz, cosAlpha, sinAlpha, cosOmega, sinOmega);
    }
  }

  /**
   * 绘制多边形 (对应 GD imagefilledpolygon)。
   * 完全透明的像素跳过 (vR == 0 → return);半透明像素按不透明绘制 (与 GD 行为一致)。
   * 扫描线 even-odd 填充。
   */
  addToCanvas(canvas: Uint8Array, width: number, height: number, minX: number, minY: number, ratio: number): void {
    const { r, g, b, a } = this.color;
    if (a === 0) return; // 完全透明 → 跳过

    const pts = this.dots.map((d) => {
      const c = d.destCoord;
      return { x: (c.x - minX) * ratio, y: (c.y - minY) * ratio };
    });

    // 共面退化 (与原实现一致: same_plan_x || same_plan_y 时跳过)
    const samePlanX = pts.every((p) => p.x === pts[0]!.x);
    const samePlanY = pts.every((p) => p.y === pts[0]!.y);
    if (samePlanX || samePlanY) return;

    let minYp = Infinity;
    let maxYp = -Infinity;
    for (const p of pts) {
      minYp = Math.min(minYp, p.y);
      maxYp = Math.max(maxYp, p.y);
    }
    const yStart = Math.max(0, Math.floor(minYp));
    const yEnd = Math.min(height - 1, Math.ceil(maxYp));

    for (let y = yStart; y <= yEnd; y++) {
      const yf = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i]!;
        const p2 = pts[(i + 1) % pts.length]!;
        if (p1.y === p2.y) continue;
        if ((p1.y <= yf && p2.y > yf) || (p2.y <= yf && p1.y > yf)) {
          const t = (yf - p1.y) / (p2.y - p1.y);
          xs.push(p1.x + t * (p2.x - p1.x));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x1 = Math.max(0, Math.ceil(xs[i]! - 0.5));
        const x2 = Math.min(width - 1, Math.floor(xs[i + 1]! - 0.5));
        for (let x = x1; x <= x2; x++) {
          const idx = (y * width + x) * 4;
          canvas[idx] = r;
          canvas[idx + 1] = g;
          canvas[idx + 2] = b;
          canvas[idx + 3] = 255;
        }
      }
    }
  }
}

// ---------- SkinRenderer ----------

type FaceName = 'back' | 'right' | 'top' | 'front' | 'left' | 'bottom';
type MemberName = 'helmet' | 'head' | 'torso' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';

const ALL_FACES: FaceName[] = ['back', 'right', 'top', 'front', 'left', 'bottom'];

class SkinRenderer {
  private skin: RGBAImage = { width: 0, height: 0, data: new Uint8Array(0) };
  private isAlex = false;
  private isNewSkinType = false;
  private hdRatio = 1;

  private ratio: number;
  private headOnly: boolean;
  private hR: number;
  private vR: number;
  private hrh: number;
  private vrll: number;
  private vrrl: number;
  private vrla: number;
  private vrra: number;
  private layers: boolean;

  private alpha = 0;
  private omega = 0;
  private cosAlpha = 1;
  private sinAlpha = 0;
  private cosOmega = 1;
  private sinOmega = 0;

  private bounds: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  private membersAngles: Record<MemberName, { cosAlpha: number; sinAlpha: number; cosOmega: number; sinOmega: number }> =
    {} as Record<MemberName, { cosAlpha: number; sinAlpha: number; cosOmega: number; sinOmega: number }>;

  private visibleFaces: Record<MemberName, { front: FaceName[]; back: FaceName[] }> =
    {} as Record<MemberName, { front: FaceName[]; back: FaceName[] }>;
  private frontFaces: FaceName[] = [];
  private backFaces: FaceName[] = [];

  private polygons: Record<MemberName, Record<FaceName, Polygon[]>> =
    {} as Record<MemberName, Record<FaceName, Polygon[]>>;

  constructor(
    ratio = 7,
    headOnly = false,
    horizontalRotation = 145,
    verticalRotation = -25,
    horizontalRotationOfHead = 0,
    verticalRotationOfLeftLeg = 0,
    verticalRotationOfRightLeg = 0,
    verticalRotationOfLeftArm = 0,
    verticalRotationOfRightArm = 0,
    layers = true,
  ) {
    this.ratio = ratio;
    this.headOnly = headOnly;
    this.hR = horizontalRotation;
    this.vR = verticalRotation;
    this.hrh = horizontalRotationOfHead;
    this.vrll = verticalRotationOfLeftLeg;
    this.vrrl = verticalRotationOfRightLeg;
    this.vrla = verticalRotationOfLeftArm;
    this.vrra = verticalRotationOfRightArm;
    this.layers = layers;
  }

  render(source: RGBAImage, isAlex = false): RGBAImage {
    let skin = { ...source, data: new Uint8Array(source.data) };
    const sourceWidth = skin.width;

    // 防止内存溢出: 宽度 > 256 时缩小
    if (sourceWidth > 256) {
      const newHeight = Math.round(skin.height / (sourceWidth / 256));
      const resized = resizeNearest(skin, 256, newHeight);
    skin = { width: resized.width, height: resized.height, data: new Uint8Array(resized.data) };
    }

    this.skin = skin;
    this.isAlex = isAlex;
    this.hdRatio = skin.width / 64;
    this.isNewSkinType = skin.width === skin.height;

    this.makeBackgroundTransparent();

    if (this.layers) {
      this.fixNewSkinTypeLayers();
    }

    this.calculateAngles();
    this.facesDetermination();
    this.generatePolygons();
    this.memberRotation();
    this.createProjectionPlan();
    return this.displayImage();
  }

  /** 角部 8×8 纯色背景检测 → 移除背景 (对应 makeBackgroundTransparent) */
  private makeBackgroundTransparent(): void {
    const w = this.skin.width;
    const h = this.skin.height;
    let tempValue: number | null = null;
    let needRemove = true;

    for (let iH = 0; iH < 8; iH++) {
      for (let iV = 0; iV < 8; iV++) {
        const idx = (iV * w + iH) * 4;
        const a = this.skin.data[idx + 3]!;
        if (a > 120) {
          needRemove = false;
        }
        const color = (this.skin.data[idx]! << 16) | (this.skin.data[idx + 1]! << 8) | this.skin.data[idx + 2]!;
        if (tempValue === null) {
          tempValue = color;
        } else if (tempValue !== color) {
          needRemove = false;
        }
      }
    }

    if (needRemove && tempValue !== null) {
      // 把背景色变为全透明 (对应 imagecolortransparent 的效果)
      const r = (tempValue >> 16) & 0xff;
      const g = (tempValue >> 8) & 0xff;
      const b = tempValue & 0xff;
      for (let i = 0; i < w * h; i++) {
        const idx = i * 4;
        if (this.skin.data[idx] === r && this.skin.data[idx + 1] === g && this.skin.data[idx + 2] === b) {
          this.skin.data[idx + 3] = 0;
        }
      }
    }
  }

  /** 1.8 皮肤: 把额外层复制到基础层 (对应 fixNewSkinTypeLayers) */
  private fixNewSkinTypeLayers(): void {
    if (!this.isNewSkinType) return;
    copyRegion(this.skin, 0, 32, 56, 16, 0, 16); // RL2, BODY2, RA2
    copyRegion(this.skin, 0, 48, 16, 16, 16, 48); // LL2
    copyRegion(this.skin, 48, 48, 16, 16, 32, 48); // LA2
  }

  private calculateAngles(): void {
    this.alpha = (this.vR * Math.PI) / 180;
    this.omega = (this.hR * Math.PI) / 180;
    this.cosAlpha = Math.cos(this.alpha);
    this.sinAlpha = Math.sin(this.alpha);
    this.cosOmega = Math.cos(this.omega);
    this.sinOmega = Math.sin(this.omega);

    const angle = (deg: number) => ({
      cosAlpha: Math.cos((deg * Math.PI) / 180),
      sinAlpha: Math.sin((deg * Math.PI) / 180),
      cosOmega: Math.cos(0),
      sinOmega: Math.sin(0),
    });

    this.membersAngles = {
      torso: angle(0),
      head: angle(0),
      helmet: angle(0),
      rightArm: angle(this.vrra),
      leftArm: angle(this.vrla),
      rightLeg: angle(this.vrrl),
      leftLeg: angle(this.vrll),
    };
    // head/helmet 的 omega 使用 hrh
    const omegaHead = (this.hrh * Math.PI) / 180;
    this.membersAngles.head.cosOmega = Math.cos(omegaHead);
    this.membersAngles.head.sinOmega = Math.sin(omegaHead);
    this.membersAngles.helmet = { ...this.membersAngles.head };

    this.bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  private facesDetermination(): void {
    const { cosAlpha, sinAlpha, cosOmega, sinOmega } = this;

    const members: MemberName[] = ['head', 'torso', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
    this.visibleFaces = {} as Record<MemberName, { front: FaceName[]; back: FaceName[] }>;

    for (const member of members) {
      const cubePoints = this.cubePoints();
      let cubeMaxDepthFaces: [Point, FaceName[]] | null = null;

      for (const cubePoint of cubePoints) {
        const [point, faces] = cubePoint;
        point.preProject(
          0, 0, 0,
          this.membersAngles[member].cosAlpha, this.membersAngles[member].sinAlpha,
          this.membersAngles[member].cosOmega, this.membersAngles[member].sinOmega,
        );
        point.project(cosAlpha, sinAlpha, cosOmega, sinOmega, this.bounds);
        const depth = point.getDepth(cosAlpha, sinAlpha, cosOmega, sinOmega, this.bounds);
        if (!cubeMaxDepthFaces || cubeMaxDepthFaces[0].getDepth(cosAlpha, sinAlpha, cosOmega, sinOmega, this.bounds) > depth) {
          cubeMaxDepthFaces = [point, faces];
        }
      }

      const back = cubeMaxDepthFaces![1];
      this.visibleFaces[member] = {
        back,
        front: ALL_FACES.filter((f) => !back.includes(f)),
      };
    }

    // 整体 (torso 位置) 的前后面
    const cubePoints = this.cubePoints();
    let cubeMaxDepthFaces: [Point, FaceName[]] | null = null;
    for (const cubePoint of cubePoints) {
      const [point, faces] = cubePoint;
      point.project(cosAlpha, sinAlpha, cosOmega, sinOmega, this.bounds);
      const depth = point.getDepth(cosAlpha, sinAlpha, cosOmega, sinOmega, this.bounds);
      if (!cubeMaxDepthFaces || cubeMaxDepthFaces[0].getDepth(cosAlpha, sinAlpha, cosOmega, sinOmega, this.bounds) > depth) {
        cubeMaxDepthFaces = [point, faces];
      }
    }
    this.backFaces = cubeMaxDepthFaces![1];
    this.frontFaces = ALL_FACES.filter((f) => !this.backFaces.includes(f));
  }

  private cubePoints(): [Point, FaceName[]][] {
    return [
      [new Point({ x: 0, y: 0, z: 0 }), ['back', 'right', 'top']],
      [new Point({ x: 0, y: 0, z: 1 }), ['front', 'right', 'top']],
      [new Point({ x: 0, y: 1, z: 0 }), ['back', 'right', 'bottom']],
      [new Point({ x: 0, y: 1, z: 1 }), ['front', 'right', 'bottom']],
      [new Point({ x: 1, y: 0, z: 0 }), ['back', 'left', 'top']],
      [new Point({ x: 1, y: 0, z: 1 }), ['front', 'left', 'top']],
      [new Point({ x: 1, y: 1, z: 0 }), ['back', 'left', 'bottom']],
      [new Point({ x: 1, y: 1, z: 1 }), ['front', 'left', 'bottom']],
    ];
  }

  /** 读取皮肤像素 (对应 imagecolorat) */
  private pixel(u: number, v: number): PixelColor {
    const x = Math.floor(u);
    const y = Math.floor(v);
    if (x < 0 || y < 0 || x >= this.skin.width || y >= this.skin.height) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const idx = (y * this.skin.width + x) * 4;
    return {
      r: this.skin.data[idx]!,
      g: this.skin.data[idx + 1]!,
      b: this.skin.data[idx + 2]!,
      a: this.skin.data[idx + 3]!,
    };
  }

  private generatePolygons(): void {
    const isAlex = this.isAlex;
    const hd = this.hdRatio;
    const img = this.skin;

    const newPoly = (pts: Point[], u: number, v: number): Polygon =>
      new Polygon(pts, this.pixel(u, v));

    const emptyFaces = (): Record<FaceName, Polygon[]> => ({
      front: [], back: [], top: [], bottom: [], right: [], left: [],
    });

    this.polygons = {
      helmet: emptyFaces(), head: emptyFaces(), torso: emptyFaces(),
      rightArm: emptyFaces(), leftArm: emptyFaces(), rightLeg: emptyFaces(), leftLeg: emptyFaces(),
    };

    // 立方体顶点网格 (与原 PHP 的 volume_points 生成一致)
    const volume = (x0: number, y0: number, z0: number, sizeX: number, sizeY: number, sizeZ: number, dx: number, dy: number, dz: number) => {
      // 返回 6 个面上的点集: 前/后 (z=z0/z1), 右/左 (x=x0/x1), 上/下 (y=y0/y1)
      const P = new Map<string, Point>();
      const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
      const get = (x: number, y: number, z: number) => {
        const k = key(x, y, z);
        if (!P.has(k)) P.set(k, new Point({ x: x + dx, y: y + dy, z: z + dz }));
        return P.get(k)!;
      };
      return { get, x0, y0, z0, x1: x0 + sizeX, y1: y0 + sizeY, z1: z0 + sizeZ, sizeX, sizeY, sizeZ };
    };

    // ---- HEAD (8×8×8, 从 y=0 开始) ----
    const head = volume(0, 0, -2 * hd, 8 * hd, 8 * hd, 8 * hd, 0, 0, 0);
    // 前/后 (z 面)
    for (let i = 0; i < 8 * hd; i++) {
      for (let j = 0; j < 8 * hd; j++) {
        this.polygons.head.back.push(newPoly(
          [head.get(i, j, head.z0), head.get(i + 1, j, head.z0), head.get(i + 1, j + 1, head.z0), head.get(i, j + 1, head.z0)],
          (32 * hd - 1) - i, 8 * hd + j,
        ));
        this.polygons.head.front.push(newPoly(
          [head.get(i, j, head.z1), head.get(i + 1, j, head.z1), head.get(i + 1, j + 1, head.z1), head.get(i, j + 1, head.z1)],
          8 * hd + i, 8 * hd + j,
        ));
      }
    }
    // 右/左 (x 面)
    for (let j = 0; j < 8 * hd; j++) {
      for (let k = 0; k < 8 * hd; k++) {
        const z = head.z0 + k;
        this.polygons.head.right.push(newPoly(
          [head.get(head.x0, j, z), head.get(head.x0, j, z + 1), head.get(head.x0, j + 1, z + 1), head.get(head.x0, j + 1, z)],
          k, 8 * hd + j,
        ));
        this.polygons.head.left.push(newPoly(
          [head.get(head.x1, j, z), head.get(head.x1, j, z + 1), head.get(head.x1, j + 1, z + 1), head.get(head.x1, j + 1, z)],
          (24 * hd - 1) - k, 8 * hd + j,
        ));
      }
    }
    // 上/下 (y 面)
    for (let i = 0; i < 8 * hd; i++) {
      for (let k = 0; k < 8 * hd; k++) {
        const z = head.z0 + k;
        this.polygons.head.top.push(newPoly(
          [head.get(i, head.y0, z), head.get(i + 1, head.y0, z), head.get(i + 1, head.y0, z + 1), head.get(i, head.y0, z + 1)],
          8 * hd + i, k,
        ));
        this.polygons.head.bottom.push(newPoly(
          [head.get(i, head.y1, z), head.get(i + 1, head.y1, z), head.get(i + 1, head.y1, z + 1), head.get(i, head.y1, z + 1)],
          16 * hd + i, 2 * hd + k,
        ));
      }
    }

    // ---- HELMET (9×9 网格, 中心偏移 -0.5hd, 尺寸 9/8) ----
    const helmet = volume(0, 0, -2 * hd, 8 * hd, 8 * hd, 8 * hd, -0.5 * hd, -0.5 * hd, -0.5 * hd);
    // 注意原实现头盔网格: x = i*9/8 - 0.5hd (i 到 9hd), z = k*9/8 - 0.5hd
    const hGet = (i: number, j: number, k: number) => {
      const x = (i * 9) / 8 - 0.5 * hd;
      const y = (j * 9) / 8 - 0.5 * hd;
      const z = (k * 9) / 8 - 0.5 * hd;
      return new Point({ x, y, z });
    };
    for (let i = 0; i < 8 * hd; i++) {
      for (let j = 0; j < 8 * hd; j++) {
        this.polygons.helmet.back.push(newPoly(
          [hGet(i, j, -2 * hd), hGet(i + 1, j, -2 * hd), hGet(i + 1, j + 1, -2 * hd), hGet(i, j + 1, -2 * hd)],
          32 * hd + (32 * hd - 1) - i, 8 * hd + j,
        ));
        this.polygons.helmet.front.push(newPoly(
          [hGet(i, j, 6 * hd), hGet(i + 1, j, 6 * hd), hGet(i + 1, j + 1, 6 * hd), hGet(i, j + 1, 6 * hd)],
          32 * hd + 8 * hd + i, 8 * hd + j,
        ));
      }
    }
    for (let j = 0; j < 8 * hd; j++) {
      for (let k = -2 * hd; k < 6 * hd; k++) {
        this.polygons.helmet.right.push(newPoly(
          [hGet(0, j, k), hGet(0, j, k + 1), hGet(0, j + 1, k + 1), hGet(0, j + 1, k)],
          32 * hd + k + 2 * hd, 8 * hd + j,
        ));
        this.polygons.helmet.left.push(newPoly(
          [hGet(8 * hd, j, k), hGet(8 * hd, j, k + 1), hGet(8 * hd, j + 1, k + 1), hGet(8 * hd, j + 1, k)],
          32 * hd + (24 * hd - 1) - k - 2 * hd, 8 * hd + j,
        ));
      }
    }
    for (let i = 0; i < 8 * hd; i++) {
      for (let k = -2 * hd; k < 6 * hd; k++) {
        this.polygons.helmet.top.push(newPoly(
          [hGet(i, 0, k), hGet(i + 1, 0, k), hGet(i + 1, 0, k + 1), hGet(i, 0, k + 1)],
          32 * hd + 8 * hd + i, k + 2 * hd,
        ));
        this.polygons.helmet.bottom.push(newPoly(
          [hGet(i, 8 * hd, k), hGet(i + 1, 8 * hd, k), hGet(i + 1, 8 * hd, k + 1), hGet(i, 8 * hd, k + 1)],
          32 * hd + 16 * hd + i, 2 * hd + k,
        ));
      }
    }

    if (!this.headOnly) {
      // ---- TORSO (8×12×4, y 偏移 8hd) ----
      const torso = volume(0, 8 * hd, 0, 8 * hd, 12 * hd, 4 * hd, 0, 0, 0);
      for (let i = 0; i < 8 * hd; i++) {
        for (let j = 0; j < 12 * hd; j++) {
          this.polygons.torso.back.push(newPoly(
            [torso.get(i, torso.y0 + j, torso.z0), torso.get(i + 1, torso.y0 + j, torso.z0), torso.get(i + 1, torso.y0 + j + 1, torso.z0), torso.get(i, torso.y0 + j + 1, torso.z0)],
            (40 * hd - 1) - i, 20 * hd + j,
          ));
          this.polygons.torso.front.push(newPoly(
            [torso.get(i, torso.y0 + j, torso.z1), torso.get(i + 1, torso.y0 + j, torso.z1), torso.get(i + 1, torso.y0 + j + 1, torso.z1), torso.get(i, torso.y0 + j + 1, torso.z1)],
            20 * hd + i, 20 * hd + j,
          ));
        }
      }
      for (let j = 0; j < 12 * hd; j++) {
        for (let k = 0; k < 4 * hd; k++) {
          this.polygons.torso.right.push(newPoly(
            [torso.get(torso.x0, torso.y0 + j, torso.z0 + k), torso.get(torso.x0, torso.y0 + j, torso.z0 + k + 1), torso.get(torso.x0, torso.y0 + j + 1, torso.z0 + k + 1), torso.get(torso.x0, torso.y0 + j + 1, torso.z0 + k)],
            16 * hd + k, 20 * hd + j,
          ));
          this.polygons.torso.left.push(newPoly(
            [torso.get(torso.x1, torso.y0 + j, torso.z0 + k), torso.get(torso.x1, torso.y0 + j, torso.z0 + k + 1), torso.get(torso.x1, torso.y0 + j + 1, torso.z0 + k + 1), torso.get(torso.x1, torso.y0 + j + 1, torso.z0 + k)],
            (32 * hd - 1) - k, 20 * hd + j,
          ));
        }
      }
      for (let i = 0; i < 8 * hd; i++) {
        for (let k = 0; k < 4 * hd; k++) {
          this.polygons.torso.top.push(newPoly(
            [torso.get(i, torso.y0, torso.z0 + k), torso.get(i + 1, torso.y0, torso.z0 + k), torso.get(i + 1, torso.y0, torso.z0 + k + 1), torso.get(i, torso.y0, torso.z0 + k + 1)],
            20 * hd + i, 16 * hd + k,
          ));
          this.polygons.torso.bottom.push(newPoly(
            [torso.get(i, torso.y1, torso.z0 + k), torso.get(i + 1, torso.y1, torso.z0 + k), torso.get(i + 1, torso.y1, torso.z0 + k + 1), torso.get(i, torso.y1, torso.z0 + k + 1)],
            28 * hd + i, (20 * hd - 1) - k,
          ));
        }
      }

      // ---- RIGHT ARM (4×12×4, x 偏移 -4hd, y 偏移 8hd) ----
      this.buildArm('rightArm', -4 * hd, 8 * hd, 0, isAlex);
      // ---- LEFT ARM (x 偏移 8hd) ----
      this.buildArm('leftArm', 8 * hd, 8 * hd, 0, isAlex);

      // ---- RIGHT LEG (4×12×4, x 0, y 20hd) ----
      this.buildLeg('rightLeg', 0, 20 * hd, false);
      // ---- LEFT LEG (x 4hd) ----
      this.buildLeg('leftLeg', 4 * hd, 20 * hd, true);
    }
  }

  /** 手臂多边形生成 (对应 PHP 的 RIGHT ARM / LEFT ARM 段) */
  private buildArm(member: 'rightArm' | 'leftArm', dx: number, dy: number, dz: number, isAlex: boolean): void {
    const hd = this.hdRatio;
    const isLeft = member === 'leftArm';
    const width = (isAlex ? 3 : 4) * hd;
    const V = (i: number, j: number, k: number) =>
      new Point({ x: i + dx, y: j + dy, z: k + dz });

    // 前/后面 (z)
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < 12 * hd; j++) {
        let color1: PixelColor;
        let color2: PixelColor;
        if (isLeft) {
          if (this.isNewSkinType) {
            color1 = this.pixel(47 * hd - i, 52 * hd + j);
            color2 = this.pixel(36 * hd + i, 52 * hd + j);
          } else {
            color1 = this.pixel((56 * hd - 1) - ((4 * hd - 1) - i), 20 * hd + j);
            color2 = this.pixel(44 * hd + ((4 * hd - 1) - i), 20 * hd + j);
          }
        } else if (isAlex) {
          color1 = this.pixel((51 * hd - 1) - i, 20 * hd + j);
          color2 = this.pixel(44 * hd + i, 20 * hd + j);
        } else {
          color1 = this.pixel((56 * hd - 1) - i, 20 * hd + j);
          color2 = this.pixel(44 * hd + i, 20 * hd + j);
        }
        this.polygons[member].back.push(new Polygon(
          [V(i, j, 0), V(i + 1, j, 0), V(i + 1, j + 1, 0), V(i, j + 1, 0)], color1,
        ));
        this.polygons[member].front.push(new Polygon(
          [V(i, j, 4 * hd), V(i + 1, j, 4 * hd), V(i + 1, j + 1, 4 * hd), V(i, j + 1, 4 * hd)], color2,
        ));
      }
    }
    // 右/左面 (x)
    for (let j = 0; j < 12 * hd; j++) {
      for (let k = 0; k < 4 * hd; k++) {
        let color1: PixelColor;
        let color2: PixelColor;
        if (isLeft) {
          if (this.isNewSkinType) {
            color1 = this.pixel(32 * hd + k, 52 * hd + j);
            color2 = this.pixel(43 * hd - k, 52 * hd + j);
          } else {
            color1 = this.pixel(40 * hd + ((4 * hd - 1) - k), 20 * hd + j);
            color2 = this.pixel((52 * hd - 1) - ((4 * hd - 1) - k), 20 * hd + j);
          }
        } else {
          const rightOffsetX = (isAlex ? 47 : 40) * hd;
          const leftOffsetX = (isAlex ? 40 : 52) * hd;
          color1 = this.pixel(rightOffsetX + k, 20 * hd + j);
          color2 = this.pixel((leftOffsetX - 1) - k, 20 * hd + j);
        }
        this.polygons[member].right.push(new Polygon(
          [V(0, j, k), V(0, j, k + 1), V(0, j + 1, k + 1), V(0, j + 1, k)], color1,
        ));
        this.polygons[member].left.push(new Polygon(
          [V(4 * hd, j, k), V(4 * hd, j, k + 1), V(4 * hd, j + 1, k + 1), V(4 * hd, j + 1, k)], color2,
        ));
      }
    }
    // 上/下面 (y)
    for (let i = 0; i < width; i++) {
      for (let k = 0; k < 4 * hd; k++) {
        let color1: PixelColor;
        let color2: PixelColor;
        if (isLeft) {
          if (this.isNewSkinType) {
            color1 = this.pixel(36 * hd + i, 48 * hd + k);
            color2 = this.pixel(40 * hd + i, 48 * hd + k);
          } else {
            color1 = this.pixel(44 * hd + ((4 * hd - 1) - i), 16 * hd + k);
            color2 = this.pixel(48 * hd + ((4 * hd - 1) - i), (20 * hd - 1) - k);
          }
        } else if (isAlex) {
          color1 = this.pixel(44 * hd + i, 16 * hd + k);
          color2 = this.pixel(47 * hd + i, 16 * hd + k);
        } else {
          color1 = this.pixel(44 * hd + i, 16 * hd + k);
          color2 = this.pixel(48 * hd + i, 16 * hd + k);
        }
        this.polygons[member].top.push(new Polygon(
          [V(i, 0, k), V(i + 1, 0, k), V(i + 1, 0, k + 1), V(i, 0, k + 1)], color1,
        ));
        this.polygons[member].bottom.push(new Polygon(
          [V(i, 12 * hd, k), V(i + 1, 12 * hd, k), V(i + 1, 12 * hd, k + 1), V(i, 12 * hd, k + 1)], color2,
        ));
      }
    }
  }

  /** 腿部多边形生成 (对应 PHP 的 RIGHT LEG / LEFT LEG 段) */
  private buildLeg(member: 'rightLeg' | 'leftLeg', dx: number, dy: number, isLeft: boolean): void {
    const hd = this.hdRatio;
    const V = (i: number, j: number, k: number) =>
      new Point({ x: i + dx, y: j + dy, z: k });

    for (let i = 0; i < 4 * hd; i++) {
      for (let j = 0; j < 12 * hd; j++) {
        let color1: PixelColor;
        let color2: PixelColor;
        if (isLeft) {
          if (this.isNewSkinType) {
            color1 = this.pixel(31 * hd - i, 52 * hd + j);
            color2 = this.pixel(20 * hd + i, 52 * hd + j);
          } else {
            color1 = this.pixel((16 * hd - 1) - ((4 * hd - 1) - i), 20 * hd + j);
            color2 = this.pixel(4 * hd + ((4 * hd - 1) - i), 20 * hd + j);
          }
        } else {
          color1 = this.pixel((16 * hd - 1) - i, 20 * hd + j);
          color2 = this.pixel(4 * hd + i, 20 * hd + j);
        }
        this.polygons[member].back.push(new Polygon(
          [V(i, j, 0), V(i + 1, j, 0), V(i + 1, j + 1, 0), V(i, j + 1, 0)], color1,
        ));
        this.polygons[member].front.push(new Polygon(
          [V(i, j, 4 * hd), V(i + 1, j, 4 * hd), V(i + 1, j + 1, 4 * hd), V(i, j + 1, 4 * hd)], color2,
        ));
      }
    }
    for (let j = 0; j < 12 * hd; j++) {
      for (let k = 0; k < 4 * hd; k++) {
        let color1: PixelColor;
        let color2: PixelColor;
        if (isLeft) {
          if (this.isNewSkinType) {
            color1 = this.pixel(16 * hd + k, 52 * hd + j);
            color2 = this.pixel(27 * hd - k, 52 * hd + j);
          } else {
            color1 = this.pixel(0 + ((4 * hd - 1) - k), 20 * hd + j);
            color2 = this.pixel((12 * hd - 1) - ((4 * hd - 1) - k), 20 * hd + j);
          }
        } else {
          color1 = this.pixel(0 + k, 20 * hd + j);
          color2 = this.pixel((12 * hd - 1) - k, 20 * hd + j);
        }
        this.polygons[member].right.push(new Polygon(
          [V(0, j, k), V(0, j, k + 1), V(0, j + 1, k + 1), V(0, j + 1, k)], color1,
        ));
        this.polygons[member].left.push(new Polygon(
          [V(4 * hd, j, k), V(4 * hd, j, k + 1), V(4 * hd, j + 1, k + 1), V(4 * hd, j + 1, k)], color2,
        ));
      }
    }
    for (let i = 0; i < 4 * hd; i++) {
      for (let k = 0; k < 4 * hd; k++) {
        let color1: PixelColor;
        let color2: PixelColor;
        if (isLeft) {
          if (this.isNewSkinType) {
            color1 = this.pixel(20 * hd + i, 48 * hd + k);
            color2 = this.pixel(24 * hd + i, 48 * hd + k);
          } else {
            color1 = this.pixel(4 * hd + ((4 * hd - 1) - i), 16 * hd + k);
            color2 = this.pixel(8 * hd + ((4 * hd - 1) - i), (20 * hd - 1) - k);
          }
        } else {
          color1 = this.pixel(4 * hd + i, 16 * hd + k);
          color2 = this.pixel(8 * hd + i, 16 * hd + k);
        }
        this.polygons[member].top.push(new Polygon(
          [V(i, 0, k), V(i + 1, 0, k), V(i + 1, 0, k + 1), V(i, 0, k + 1)], color1,
        ));
        this.polygons[member].bottom.push(new Polygon(
          [V(i, 12 * hd, k), V(i + 1, 12 * hd, k), V(i + 1, 12 * hd, k + 1), V(i, 12 * hd, k + 1)], color2,
        ));
      }
    }
  }

  /** 各部位旋转定位 (对应 memberRotation) */
  private memberRotation(): void {
    const pre = (member: MemberName, dx: number, dy: number, dz: number) => {
      const angles = this.membersAngles[member];
      for (const face of Object.values(this.polygons[member])) {
        for (const poly of face) {
          poly.preProject(dx, dy, dz, angles.cosAlpha, angles.sinAlpha, angles.cosOmega, angles.sinOmega);
        }
      }
    };

    pre('head', 4, 8, 2);
    pre('helmet', 4, 8, 2);

    if (!this.headOnly) {
      pre('rightArm', -2, 8, 2);
      pre('leftArm', 10, 8, 2);
      pre('rightLeg', 2, 20, this.membersAngles.rightLeg.sinAlpha < 0 ? 0 : 4);
      pre('leftLeg', 6, 20, this.membersAngles.leftLeg.sinAlpha < 0 ? 0 : 4);
    }
  }

  private createProjectionPlan(): void {
    const { cosAlpha, sinAlpha, cosOmega, sinOmega } = this;
    for (const piece of Object.values(this.polygons)) {
      for (const face of Object.values(piece)) {
        for (const poly of face) {
          if (!poly.isProjected) {
            poly.project(cosAlpha, sinAlpha, cosOmega, sinOmega, this.bounds);
          }
        }
      }
    }
  }

  private displayImage(): RGBAImage {
    const width = this.bounds.maxX - this.bounds.minX;
    const height = this.bounds.maxY - this.bounds.minY;
    const ratio = this.ratio * 2;

    const srcWidth = Math.max(1, Math.ceil(ratio * width + 1));
    const srcHeight = Math.max(1, Math.ceil(ratio * height + 1));
    const canvas = new Uint8Array(srcWidth * srcHeight * 4); // 全透明

    const displayOrder = this.getDisplayOrder();

    for (const pieces of displayOrder) {
      for (const [piece, faces] of Object.entries(pieces)) {
        for (const face of faces) {
          for (const poly of this.polygons[piece as MemberName][face as FaceName]) {
            poly.addToCanvas(canvas, srcWidth, srcHeight, this.bounds.minX, this.bounds.minY, ratio);
          }
        }
      }
    }

    // 抗锯齿: 缩小一半 (对应 imagecopyresampled)
    const realWidth = Math.max(1, Math.floor(srcWidth / 2));
    const realHeight = Math.max(1, Math.floor(srcHeight / 2));
    return resizeBilinear(
      { width: srcWidth, height: srcHeight, data: canvas },
      realWidth,
      realHeight,
    );
  }

  private getDisplayOrder(): { [member: string]: FaceName[] }[] {
    const displayOrder: { [member: string]: FaceName[] }[] = [];
    const visible = (member: MemberName) => this.visibleFaces[member];

    if (this.frontFaces.includes('top')) {
      if (this.frontFaces.includes('right')) {
        displayOrder.push({ leftLeg: this.backFaces }, { leftLeg: visible('leftLeg').front });
        displayOrder.push({ rightLeg: this.backFaces }, { rightLeg: visible('rightLeg').front });
        displayOrder.push({ leftArm: this.backFaces }, { leftArm: visible('leftArm').front });
        displayOrder.push({ torso: this.backFaces }, { torso: visible('torso').front });
        displayOrder.push({ rightArm: this.backFaces }, { rightArm: visible('rightArm').front });
      } else {
        displayOrder.push({ rightLeg: this.backFaces }, { rightLeg: visible('rightLeg').front });
        displayOrder.push({ leftLeg: this.backFaces }, { leftLeg: visible('leftLeg').front });
        displayOrder.push({ rightArm: this.backFaces }, { rightArm: visible('rightArm').front });
        displayOrder.push({ torso: this.backFaces }, { torso: visible('torso').front });
        displayOrder.push({ leftArm: this.backFaces }, { leftArm: visible('leftArm').front });
      }
      displayOrder.push({ helmet: this.backFaces });
      displayOrder.push({ head: this.backFaces });
      displayOrder.push({ head: visible('head').front });
      displayOrder.push({ helmet: visible('head').front });
    } else {
      displayOrder.push({ helmet: this.backFaces });
      displayOrder.push({ head: this.backFaces });
      displayOrder.push({ head: visible('head').front });
      displayOrder.push({ helmet: visible('head').front });

      if (this.frontFaces.includes('right')) {
        displayOrder.push({ leftArm: this.backFaces }, { leftArm: visible('leftArm').front });
        displayOrder.push({ torso: this.backFaces }, { torso: visible('torso').front });
        displayOrder.push({ rightArm: this.backFaces }, { rightArm: visible('rightArm').front });
        displayOrder.push({ leftLeg: this.backFaces }, { leftLeg: visible('leftLeg').front });
        displayOrder.push({ rightLeg: this.backFaces }, { rightLeg: visible('rightLeg').front });
      } else {
        displayOrder.push({ rightArm: this.backFaces }, { rightArm: visible('rightArm').front });
        displayOrder.push({ torso: this.backFaces }, { torso: visible('torso').front });
        displayOrder.push({ leftArm: this.backFaces }, { leftArm: visible('leftArm').front });
        displayOrder.push({ rightLeg: this.backFaces }, { rightLeg: visible('rightLeg').front });
        displayOrder.push({ leftLeg: this.backFaces }, { leftLeg: visible('leftLeg').front });
      }
    }

    return displayOrder;
  }
}

// ---------- 图像工具 ----------

function copyRegion(img: RGBAImage, sx: number, sy: number, w: number, h: number, dx: number, dy: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((sy + y) * img.width + (sx + x)) * 4;
      const di = ((dy + y) * img.width + (dx + x)) * 4;
      img.data[di] = img.data[si]!;
      img.data[di + 1] = img.data[si + 1]!;
      img.data[di + 2] = img.data[si + 2]!;
      img.data[di + 3] = img.data[si + 3]!;
    }
  }
}

/** 最近邻缩放 */
export function resizeNearest(img: RGBAImage, width: number, height: number): RGBAImage {
  const out = new Uint8Array(width * height * 4);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y++) {
    const srcY = Math.min(img.height - 1, Math.floor(y * sy));
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(img.width - 1, Math.floor(x * sx));
      const si = (srcY * img.width + srcX) * 4;
      const di = (y * width + x) * 4;
      out[di] = img.data[si]!;
      out[di + 1] = img.data[si + 1]!;
      out[di + 2] = img.data[si + 2]!;
      out[di + 3] = img.data[si + 3]!;
    }
  }
  return { width, height, data: out };
}

/** 双线性缩放 (对应 imagecopyresampled) */
export function resizeBilinear(img: RGBAImage, width: number, height: number): RGBAImage {
  const out = new Uint8Array(width * height * 4);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y++) {
    const srcY = y * sy;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(img.height - 1, y0 + 1);
    const fy = srcY - y0;
    for (let x = 0; x < width; x++) {
      const srcX = x * sx;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(img.width - 1, x0 + 1);
      const fx = srcX - x0;

      const di = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = img.data[(y0 * img.width + x0) * 4 + c]!;
        const p10 = img.data[(y0 * img.width + x1) * 4 + c]!;
        const p01 = img.data[(y1 * img.width + x0) * 4 + c]!;
        const p11 = img.data[(y1 * img.width + x1) * 4 + c]!;
        const top = p00 * (1 - fx) + p10 * fx;
        const bottom = p01 * (1 - fx) + p11 * fx;
        out[di + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { width, height, data: out };
}

// ---------- 高层 API (对应 Minecraft) ----------

/**
 * 皮肤 3D 渲染 (renderSkin): 前后两个视角 + 内边距合成
 * 对应 Minecraft::renderSkin($skin, $ratio, $isAlex)
 */
export function renderSkin(raw: RGBAImage, ratio = 7, isAlex = false): RGBAImage {
  const vp = 15;
  const hp = 30;
  const ip = 15;

  const front = new SkinRenderer(ratio, false, -45).render(raw, isAlex);
  const back = new SkinRenderer(ratio, false, 135).render(raw, isAlex);

  const width = front.width;
  const height = front.height;

  const canvas = transparentCanvas((hp + width + ip) * 2, vp * 2 + height);
  paste(back, canvas, hp, vp);
  paste(front, canvas, hp + width + ip * 2, vp);

  return canvas;
}

/**
 * 披风渲染 (renderCape): 取披风正面区域缩放到指定高度
 * 对应 CapeRenderer::render + Minecraft::renderCape
 */
export function renderCape(raw: RGBAImage, height: number): RGBAImage {
  const vp = 20;
  const hp = 40;

  const hdRatio = raw.width / 64;
  const outHeight = height;
  const outWidth = Math.round((outHeight / 16) * 10);

  // imagecopyresampled(canvas, src, 0, 0, 1*hdRatio, 1*hdRatio, outW, outH, srcW*10/64, srcH*16/32)
  const srcX = 1 * hdRatio;
  const srcY = 1 * hdRatio;
  const srcW = raw.width * (10 / 64);
  const srcH = raw.height * (16 / 32);

  // 裁剪源区域 (最近邻按像素网格) 然后双线性缩放
  const crop = new Uint8Array(Math.ceil(srcW) * Math.ceil(srcH) * 4);
  const cropW = Math.ceil(srcW);
  const cropH = Math.ceil(srcH);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const si = (Math.floor(srcY + y) * raw.width + Math.floor(srcX + x)) * 4;
      const di = (y * cropW + x) * 4;
      crop[di] = raw.data[si]!;
      crop[di + 1] = raw.data[si + 1]!;
      crop[di + 2] = raw.data[si + 2]!;
      crop[di + 3] = raw.data[si + 3]!;
    }
  }

  const scaled = resizeBilinear({ width: cropW, height: cropH, data: crop }, outWidth, outHeight);

  const canvas = transparentCanvas(hp * 2 + outWidth, vp * 2 + outHeight);
  paste(scaled, canvas, hp, vp);

  return canvas;
}

/** 2D 头像 (render2dAvatar): 正面无旋转,仅头部 */
export function render2dAvatar(raw: RGBAImage, ratio = 15): RGBAImage {
  return new SkinRenderer(ratio, true, 0, 0).render(raw);
}

/** 3D 头像 (render3dAvatar): 水平旋转 45° */
export function render3dAvatar(raw: RGBAImage, ratio = 15): RGBAImage {
  return new SkinRenderer(ratio, true, 45).render(raw);
}

function transparentCanvas(width: number, height: number): RGBAImage {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

function paste(src: RGBAImage, dst: RGBAImage, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      const di = ((dy + y) * dst.width + (dx + x)) * 4;
      dst.data[di] = src.data[si]!;
      dst.data[di + 1] = src.data[si + 1]!;
      dst.data[di + 2] = src.data[si + 2]!;
      dst.data[di + 3] = src.data[si + 3]!;
    }
  }
}
