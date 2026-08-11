'use client';

/**
 * 上传表单 (对照原版 Upload.tsx + FileInput):
 *   名称 / 类型 (Steve/Alex/披风) / 文件选择 / 内容政策提示 / 设为隐私 / 上传按钮
 */
import { useState } from 'react';

interface UploadFormProps {
  /** texture_name_regexp 占位提示 */
  nameRule: string;
  /** content_policy (Markdown → HTML) */
  contentPolicy: string;
}

const I18N = {
  'texture-name': '材质名称',
  'texture-type': '材质类型',
  'select-file': '选择文件',
  'set-as-private': '设置为私密材质',
  'privacy-notice': '其他人将不会在皮肤库中看到此材质',
  upload: '确认上传',
  uploading: '上传中',
  cape: '披风',
  'file-ext-error': '错误：皮肤文件必须为 PNG 格式',
  'empty-file': '你还没有上传任何文件哦',
  'empty-name': '给你的材质起个名字吧',
};

export function UploadForm({ nameRule, contentPolicy }: UploadFormProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('steve');
  const [file, setFile] = useState<File | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [warning, setWarning] = useState('');

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && !f.type.includes('png') && !f.name.toLowerCase().endsWith('.png')) {
      setWarning(I18N['file-ext-error']);
      e.target.value = '';
      return;
    }
    setWarning('');
    setFile(f);
  };

  const handleUpload = async () => {
    if (!name.trim()) {
      setWarning(I18N['empty-name']);
      return;
    }
    if (!file) {
      setWarning(I18N['empty-file']);
      return;
    }
    setIsUploading(true);
    setWarning('');
    try {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('type', type);
      fd.append('file', file, file.name);
      fd.append('public', isPrivate ? '0' : '1');
      const res = await fetch('/texture', {
        method: 'POST',
        headers: { 'X-CSRF-TOKEN': csrf },
        body: fd,
      });
      const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string; data?: { tid?: number } };
      if (body.code === 0) {
        window.location.href = `/skinlib/show/${body.data?.tid}`;
        return;
      }
      setWarning(body.message ?? '上传失败');
    } catch {
      setWarning('网络错误，请重试');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <div className="card card-primary">
        <div className="card-body">
          <div className="form-group">
            <label htmlFor="texture-name">{I18N['texture-name']}</label>
            <input
              className="form-control"
              id="texture-name"
              type="text"
              placeholder={nameRule}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>{I18N['texture-type']}</label>
            <br />
            <label className="mr-4">
              <input
                type="radio"
                className="mr-1"
                name="type"
                value="steve"
                checked={type === 'steve'}
                onChange={(e) => setType(e.target.value)}
              />
              Steve
            </label>
            <label className="mr-4">
              <input
                type="radio"
                className="mr-1"
                name="type"
                value="alex"
                checked={type === 'alex'}
                onChange={(e) => setType(e.target.value)}
              />
              Alex
            </label>
            <label className="mr-4">
              <input
                type="radio"
                className="mr-1"
                name="type"
                value="cape"
                checked={type === 'cape'}
                onChange={(e) => setType(e.target.value)}
              />
              {I18N.cape}
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="select-file">{I18N['select-file']}</label>
            <div className="input-group">
              <div className="custom-file">
                <input
                  type="file"
                  className="custom-file-input"
                  id="select-file"
                  accept="image/png, image/x-png"
                  onChange={handleFileChange}
                />
                <label className="custom-file-label" htmlFor="select-file">
                  {file ? file.name : I18N['select-file']}
                </label>
              </div>
            </div>
          </div>

          {warning && <div className="alert alert-warning">{warning}</div>}

          {contentPolicy && (
            <div
              className="callout callout-warning"
              dangerouslySetInnerHTML={{ __html: contentPolicy }}
            />
          )}
        </div>
        <div className="card-footer">
          <div className="container px-0 d-flex justify-content-between">
            <label className="mt-2" htmlFor="is-private" title={I18N['privacy-notice']}>
              <input
                type="checkbox"
                id="is-private"
                className="mr-1"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              {I18N['set-as-private']}
            </label>
            <button className="btn btn-success" disabled={isUploading} onClick={handleUpload}>
              {isUploading ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-1" />
                  <span>{I18N.uploading}</span>
                </>
              ) : (
                I18N.upload
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
