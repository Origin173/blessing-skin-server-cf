'use client';

/** 衣柜管理 (对照原版 views/user/Closet/*): 网格 + 预览 + 应用/重命名/移除/设头像 */
import { useState } from 'react';

interface ClosetItemData {
  tid: number;
  item_name: string | null;
  type: string;
}

interface ClosetManagerProps {
  initial: ClosetItemData[];
  /** 当前用户角色 (应用目标) */
  players: { pid: number; name: string }[];
}

const I18N = {
  renameItem: '重命名物品',
  removeItem: '从衣柜中移除',
  setAsAvatar: '设为头像',
  viewInSkinlib: '在皮肤库中查看',
  apply: '立即使用',
  useAs: '使用...',
  removeNotice: '确定要从衣柜中移除此材质吗？',
  newName: '请输入此衣柜物品的新名称：',
  avatarWrongType: '披风不能被设置为头像',
  empty: '衣柜里啥都没有哦~',
};

export function ClosetManager({ initial, players }: ClosetManagerProps) {
  const [items, setItems] = useState<ClosetItemData[]>(initial);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<ClosetItemData | null>(null);

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const api = async (path: string, method = 'POST', body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await res.json().catch(() => ({}))) as { code?: number; message?: string };
  };

  const handleRename = async (item: ClosetItemData) => {
    const name = window.prompt(I18N.newName, item.item_name ?? '');
    if (!name) return;
    const r = await api(`/api/user/closet/${item.tid}`, 'PUT', { name });
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const handleRemove = async (item: ClosetItemData) => {
    if (!window.confirm(I18N.removeNotice)) return;
    const r = await api(`/api/user/closet/${item.tid}`, 'DELETE');
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const handleSetAvatar = async (item: ClosetItemData) => {
    if (item.type === 'cape') {
      setMessage(I18N.avatarWrongType);
      return;
    }
    const r = await api('/api/user/avatar', 'POST', { tid: item.tid });
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const handleApply = async (item: ClosetItemData, pid: number) => {
    const key = item.type === 'cape' ? 'cape' : 'skin';
    const r = await api(`/api/user/player/${pid}/textures`, 'PUT', { [key]: item.tid });
    if (r.code === 0) setMessage('应用成功');
    else setMessage(r.message ?? '');
  };

  return (
    <div>
      {message && <div className="alert alert-warning">{message}</div>}
      {items.length === 0 && (
        <div className="text-center py-5">
          <p>{I18N.empty}</p>
          <a href="/skinlib" className="btn btn-primary">
            去皮肤库看看吧
          </a>
        </div>
      )}
      <div className="d-flex flex-wrap">
        {items.map((item) => (
          <div key={item.tid} className="card m-2" style={{ width: 220 }}>
            <div className="card-body p-2 text-center">
              <a href={`/skinlib/show/${item.tid}`} target="_blank">
                <img
                  src={`/preview/${item.tid}?height=120&png`}
                  alt={item.item_name ?? String(item.tid)}
                  style={{ height: 140, objectFit: 'contain', maxWidth: '100%' }}
                />
              </a>
              <p className="mb-1 text-truncate" title={item.item_name ?? undefined}>
                {item.item_name ?? item.tid}
              </p>
            </div>
            <div className="card-footer p-2">
              <div className="d-flex justify-content-around">
                <i
                  className="fas fa-cog"
                  title={I18N.useAs}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelected(item)}
                />
                <i
                  className="fas fa-user-circle"
                  title={I18N.setAsAvatar}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleSetAvatar(item)}
                />
                <i
                  className="fas fa-pen"
                  title={I18N.renameItem}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleRename(item)}
                />
                <i
                  className="fas fa-trash"
                  title={I18N.removeItem}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleRemove(item)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 应用材质模态 */}
      {selected && (
        <div className="modal fade show d-block" tabIndex={-1} role="dialog">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{I18N.apply}</h5>
                <button type="button" className="close" onClick={() => setSelected(null)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p>{I18N.useAs}</p>
                {players.length === 0 && <p>你好像还没有添加任何角色哦</p>}
                {players.map((player) => (
                  <button
                    key={player.pid}
                    className="btn btn-outline-primary btn-block mb-2"
                    onClick={() => handleApply(selected, player.pid)}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
