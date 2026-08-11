'use client';

/** show 页操作按钮 (对照原版 Show 组件): 下载 / 收藏 / 管理 (改名/改模型/隐私/删除) */
import { useState } from 'react';

interface ShowActionsProps {
  tid: number;
  type: string;
  canManage: boolean;
  allowDownload: boolean;
  loggedIn: boolean;
  isPublic: boolean;
  textureName: string;
}

const I18N = {
  download: '下载',
  addToCloset: '添加至衣柜',
  removeFromCloset: '从衣柜中移除',
  deleteTexture: '删除材质',
  manageNotice: '材质设为隐私或被删除后将会从每一个收藏者的衣柜中移除。',
  deleteNotice: '真的要删除此材质吗？',
  setAsPrivate: '设为隐私',
  setAsPublic: '设为公开',
  setNewTextureName: '请输入新的材质名称：',
  setNewTextureModel: '请选择新的材质适用模型：',
  anonymous: '登录后才能使用衣柜哦',
};

export function ShowActions({
  tid,
  type,
  canManage,
  allowDownload,
  loggedIn,
  isPublic,
  textureName,
}: ShowActionsProps) {
  const [inCloset, setInCloset] = useState(false);
  const [liked, setLiked] = useState(false);
  const [message, setMessage] = useState('');

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

  const handleCloset = async () => {
    if (!loggedIn) {
      setMessage(I18N.anonymous);
      return;
    }
    if (inCloset) {
      const r = await api(`/user/closet/${tid}`, 'DELETE');
      if (r.code === 0) setInCloset(false);
      else setMessage(r.message ?? '');
    } else {
      const r = await api('/user/closet', 'POST', { tid, item_name: textureName });
      if (r.code === 0) setInCloset(true);
      else setMessage(r.message ?? '');
    }
  };

  const handleLike = async () => {
    if (!loggedIn) {
      setMessage(I18N.anonymous);
      return;
    }
    const r = liked
      ? await api(`/user/closet/${tid}`, 'DELETE')
      : await api('/user/closet', 'POST', { tid, item_name: textureName });
    if (r.code === 0) setLiked((v) => !v);
    else setMessage(r.message ?? '');
  };

  const handleRename = async () => {
    const name = window.prompt(I18N.setNewTextureName, textureName);
    if (!name) return;
    const r = await api(`/texture/${tid}/name`, 'PUT', { name });
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const handleType = async () => {
    const model = window.prompt(I18N.setNewTextureModel, type);
    if (!model) return;
    const r = await api(`/texture/${tid}/type`, 'PUT', { type: model });
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const handlePrivacy = async () => {
    const r = await api(`/texture/${tid}/privacy`, 'PUT', { privacy: !isPublic });
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const handleDelete = async () => {
    if (!window.confirm(I18N.deleteNotice)) return;
    const r = await api(`/texture/${tid}`, 'DELETE');
    if (r.code === 0) window.location.href = '/skinlib';
    else setMessage(r.message ?? '');
  };

  return (
    <div>
      {message && <div className="alert alert-warning">{message}</div>}
      <div className="d-flex flex-column">
        {allowDownload && (
          <a href={`/raw/${tid}`} className="btn btn-primary btn-block mb-2" download>
            <i className="fas fa-download mr-1" />
            {I18N.download}
          </a>
        )}
        {loggedIn && (
          <button className="btn btn-outline-primary btn-block mb-2" onClick={handleCloset}>
            <i className={`fas fa-star mr-1 ${inCloset ? 'text-warning' : ''}`} />
            {inCloset ? I18N.removeFromCloset : I18N.addToCloset}
          </button>
        )}
        {canManage && (
          <>
            <button className="btn btn-outline-secondary btn-block mb-2" onClick={handleRename}>
              <i className="fas fa-edit mr-1" />
              修改
            </button>
            <button className="btn btn-outline-secondary btn-block mb-2" onClick={handleType}>
              <i className="fas fa-user-tag mr-1" />
              模型
            </button>
            <button className="btn btn-outline-secondary btn-block mb-2" onClick={handlePrivacy}>
              <i className="fas fa-eye-slash mr-1" />
              {isPublic ? I18N.setAsPrivate : I18N.setAsPublic}
            </button>
            <button className="btn btn-outline-danger btn-block mb-2" onClick={handleDelete}>
              <i className="fas fa-trash mr-1" />
              {I18N.deleteTexture}
            </button>
            <p className="text-muted small">{I18N.manageNotice}</p>
          </>
        )}
      </div>
    </div>
  );
}
