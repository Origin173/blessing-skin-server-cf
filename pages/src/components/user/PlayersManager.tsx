'use client';

/** 角色管理 (对照原版 views/user/Players/*): 列表/添加/改名/清除材质/删除/应用材质 */
import { useState } from 'react';

interface Player {
  pid: number;
  name: string;
  tid_skin: number;
  tid_cape: number;
}

interface PlayersManagerProps {
  initial: Player[];
  /** 衣柜材质 (用于应用) */
  closetItems: { tid: number; item_name: string | null; type: string }[];
}

const I18N = {
  addPlayer: '添加新角色',
  editPname: '修改角色名',
  deleteTexture: '删除材质',
  deletePlayer: '删除角色',
  textureEmpty: '未上传',
  operation: '操作',
  playerName: '角色名',
  id: 'ID',
  add: '添加',
  newName: '请输入角色名：',
  chooseTexture: '选择要应用的材质',
  deleteNotice: '真的要删除该玩家吗？这将是永久性的删除',
  clearNotice: '选择要删除的材质类型',
  skin: '皮肤',
  cape: '披风',
  apply: '应用',
};

export function PlayersManager({ initial, closetItems }: PlayersManagerProps) {
  const [players, setPlayers] = useState<Player[]>(initial);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
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
    return (await res.json().catch(() => ({}))) as { code?: number; message?: string; data?: unknown };
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      setMessage('你还没有填写名称哦');
      return;
    }
    const r = await api('/api/user/player', 'POST', { name: newName });
    if (r.code === 0) {
      window.location.reload();
    } else {
      setMessage(r.message ?? '添加失败');
    }
  };

  const handleRename = async (player: Player) => {
    const name = window.prompt(I18N.newName, player.name);
    if (!name) return;
    const r = await api(`/api/user/player/${player.pid}/name`, 'PUT', { name });
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const handleClear = async (player: Player) => {
    const choice = window.prompt(`${I18N.clearNotice} (skin/cape)`, 'skin');
    if (!choice) return;
    const r = await api(`/api/user/player/${player.pid}/textures`, 'DELETE', {
      type: choice === 'cape' ? 'cape' : 'skin',
    });
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const handleDelete = async (player: Player) => {
    if (!window.confirm(I18N.deleteNotice)) return;
    const r = await api(`/api/user/player/${player.pid}`, 'DELETE');
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  const handleApplyTexture = async (player: Player, tid: number, type: string) => {
    const key = type === 'cape' ? 'cape' : 'skin';
    const r = await api(`/api/user/player/${player.pid}/textures`, 'PUT', { [key]: tid });
    if (r.code === 0) window.location.reload();
    else setMessage(r.message ?? '');
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h3 className="card-title">{I18N.operation}</h3>
          <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}>
            <span>{I18N.addPlayer}</span>
          </button>
        </div>
      </div>
      <div className="card-body p-0">
        {adding && (
          <div className="p-3 border-bottom">
            <div className="input-group">
              <input
                type="text"
                className="form-control"
                placeholder={I18N.newName}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <div className="input-group-append">
                <button className="btn btn-success" onClick={handleAdd}>
                  {I18N.add}
                </button>
              </div>
            </div>
          </div>
        )}
        {message && <div className="alert alert-warning m-3">{message}</div>}
        <table className="table table-hover">
          <thead>
            <tr>
              <th>{I18N.id}</th>
              <th>{I18N.playerName}</th>
              <th>{I18N.operation}</th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center">
                  还没有添加任何角色哦
                </td>
              </tr>
            )}
            {players.map((player) => (
              <tr key={player.pid}>
                <td>{player.pid}</td>
                <td>
                  <span>{player.name}</span>
                  <i
                    className="fas fa-pen ml-2"
                    style={{ cursor: 'pointer' }}
                    title={I18N.editPname}
                    onClick={() => handleRename(player)}
                  />
                </td>
                <td className="d-flex">
                  <button className="btn btn-warning" onClick={() => handleClear(player)}>
                    {I18N.deleteTexture}
                  </button>
                  <div className="dropdown ml-2">
                    <button className="btn btn-info dropdown-toggle" data-toggle="dropdown">
                      {I18N.chooseTexture}
                    </button>
                    <div className="dropdown-menu">
                      {closetItems.length === 0 && <span className="dropdown-item">衣柜为空</span>}
                      {closetItems.map((item) => (
                        <a
                          key={item.tid}
                          href="#"
                          className="dropdown-item"
                          onClick={(e) => {
                            e.preventDefault();
                            handleApplyTexture(player, item.tid, item.type);
                          }}
                        >
                          {item.item_name ?? item.tid}（{item.type === 'cape' ? I18N.cape : I18N.skin}）
                        </a>
                      ))}
                    </div>
                  </div>
                  <button className="btn btn-danger ml-2" onClick={() => handleDelete(player)}>
                    {I18N.deletePlayer}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
