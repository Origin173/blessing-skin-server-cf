'use client';

/**
 * 3D 皮肤预览 (对照原版 components/Viewer.tsx 的 skinview3d 用法):
 *   - 皮肤/披风加载 (preview 端点 PNG)
 *   - 动作循环 (walking/running/flying/idle) + 旋转按钮
 */
import { useEffect, useRef, useState } from 'react';
import * as skinview3d from 'skinview3d';

interface Viewer3dProps {
  skin?: string;
  cape?: string;
  isAlex: boolean;
}

const animations = [
  () => new skinview3d.WalkingAnimation(),
  () => new skinview3d.RunningAnimation(),
  () => new skinview3d.FlyingAnimation(),
  () => new skinview3d.IdleAnimation(),
];

export function Viewer3d({ skin, cape, isAlex }: Viewer3dProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<skinview3d.SkinViewer | null>(null);
  const [animIndex, setAnimIndex] = useState(0);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return;
    const viewer = new skinview3d.SkinViewer({
      canvas: canvasRef.current,
      width: 300,
      height: 400,
      skin: skin ?? undefined,
      cape: cape ?? undefined,
      model: isAlex ? 'slim' : 'default',
      animation: animate ? new skinview3d.WalkingAnimation() : undefined,
    });
    viewerRef.current = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    if (skin) v.loadSkin(skin);
    else v.loadSkin(null);
    if (cape) v.loadCape(cape);
    else v.loadCape(null);
  }, [skin, cape]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.animation = animate ? (animations[animIndex % animations.length]() as never) : null;
  }, [animIndex, animate]);

  return (
    <div className="card" style={{ minHeight: 400 }}>
      <div className="card-header">
        <div className="d-flex justify-content-end">
          <i
            className="fas fa-play-circle mr-2"
            title="播放动画"
            style={{ cursor: 'pointer' }}
            onClick={() => setAnimate((v) => !v)}
          />
          <i
            className="fas fa-sync-alt"
            title="切换动画"
            style={{ cursor: 'pointer' }}
            onClick={() => setAnimIndex((i) => i + 1)}
          />
        </div>
      </div>
      <div className="card-body d-flex justify-content-center">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
