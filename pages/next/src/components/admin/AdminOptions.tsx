'use client';

/** 站点选项表单 (对照原版 customize/score/options/resource 选项页) */
import { useEffect, useState } from 'react';

interface AdminOptionsProps {
  page: string;
  /** 分组 → 选项 key 列表 (由页面服务端传入, 与 admin.ts OPTION_PAGES 一致) */
  groups: { group: string; keys: string[] }[];
}

/** 布尔开关选项 (原版表单中为 checkbox 的 key) */
const BOOLEAN_KEYS = new Set([
  'transparent_navbar',
  'hide_intro',
  'fixed_bg',
  'return_score',
  'sign_after_zero',
  'take_back_scores_after_deletion',
  'require_verification',
  'register_with_player_name',
  'auto_del_invalid_texture',
  'allow_downloading_texture',
  'force_ssl',
  'auto_detect_asset_url',
  'enable_avatar_cache',
  'enable_preview_cache',
  'recaptcha_invisible',
  'dark_mode',
]);

/** 下拉选择选项 */
const SELECT_KEYS: Record<string, [string, string][]> = {
  navbar_color: [
    ['cyan', 'Cyan'],
    ['black', 'Black'],
    ['white', 'White'],
    ['red', 'Red'],
    ['green', 'Green'],
    ['blue', 'Blue'],
    ['yellow', 'Yellow'],
    ['purple', 'Purple'],
    ['maroon', 'Maroon'],
    ['teal', 'Teal'],
  ],
  sidebar_color: [
    ['dark-maroon', 'Dark Maroon'],
    ['dark-cyan', 'Dark Cyan'],
    ['dark-navy', 'Dark Navy'],
    ['dark-olive', 'Dark Olive'],
    ['dark-green', 'Dark Green'],
    ['dark-red', 'Dark Red'],
    ['dark-purple', 'Dark Purple'],
    ['dark-yellow', 'Dark Yellow'],
    ['dark-black', 'Dark Black'],
  ],
  color_mode: [
    ['light', 'Light'],
    ['dark', 'Dark'],
  ],
  copyright_prefer: [
    ['0', 'Powered with ❤'],
    ['1', 'Powered by'],
    ['2', 'Proudly powered by'],
    ['3', '由 ... 强力驱动'],
    ['4', '采用 ... 搭建'],
    ['5', '使用 ... 稳定运行'],
  ],
};

export function AdminOptions({ page, groups }: AdminOptionsProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  useEffect(() => {
    fetch(`/admin/options/${page}`, { headers: { Accept: 'application/json' } })
      .then((res) => res.json())
      .then((body) => {
        if (body && typeof body === 'object' && !('code' in body)) {
          setValues(body as Record<string, string>);
        }
      })
      .finally(() => setLoading(false));
  }, [page]);

  const handleSave = async () => {
    const res = await fetch(`/admin/options/${page}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
      body: JSON.stringify(values),
    });
    const r = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    setMessage(r.message ?? (r.code === 0 ? '设置已保存。' : '保存失败'));
  };

  if (loading) return <div className="text-center py-5">加载中...</div>;

  return (
    <div>
      {message && <div className={`alert alert-${message.includes('失败') ? 'warning' : 'success'}`}>{message}</div>}
      {groups.map(({ group, keys }) => (
        <div className="card" key={group}>
          <div className="card-header">
            <h3 className="card-title">{group}</h3>
          </div>
          <div className="card-body">
            {keys.map((key) => (
              <div className="form-group" key={key}>
                <label htmlFor={`opt-${key}`}>{key}</label>
                {BOOLEAN_KEYS.has(key) ? (
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id={`opt-${key}`}
                      checked={values[key] === 'true' || values[key] === '1'}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.checked ? 'true' : 'false' }))}
                    />
                    <label className="form-check-label" htmlFor={`opt-${key}`}>
                      开启
                    </label>
                  </div>
                ) : SELECT_KEYS[key] ? (
                  <select
                    className="form-control"
                    id={`opt-${key}`}
                    value={values[key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  >
                    {SELECT_KEYS[key].map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="form-control"
                    id={`opt-${key}`}
                    value={values[key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <button className="btn btn-primary" onClick={handleSave}>
        保存
      </button>
    </div>
  );
}
