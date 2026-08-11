/**
 * 皮肤库列表页 (对照 skinlib/index.twig + 原版 SkinLibrary 组件):
 *   筛选栏 (模型/排序/上传者) + 网格 (245px card: 预览/名称/模型徽章/作者/收藏) + 分页
 * 服务端渲染,筛选/分页通过 URL query (原版组件同步 searchParams 的语义)
 */
import Link from 'next/link';
import { t } from '@/lib/server/i18n';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { Shell } from '@/components/layout/Shell';

export const dynamic = 'force-dynamic';

interface SearchParams {
  filter?: string;
  keyword?: string;
  uploader?: string;
  sort?: string;
  page?: string;
}

interface TextureRow {
  tid: number;
  name: string;
  type: string;
  uploader: number;
  public: number;
  likes: number;
  upload_at: string;
  nickname: string;
}

const PER_PAGE = 20;

function humanizeType(type: string): string {
  if (type === 'alex') return 'Alex';
  if (type === 'cape') return '披风';
  return 'Steve';
}

function buildQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export default async function SkinLibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { env, ctx, site } = await getPageData();
  const locale = ctx.locale;
  const user = ctx.user;

  const type = ['skin', 'steve', 'alex', 'cape'].includes(sp.filter ?? '') ? (sp.filter as string) : 'skin';
  const uploader = sp.uploader && sp.uploader !== '0' ? Number(sp.uploader) : null;
  const keyword = sp.keyword ? decodeURIComponent(sp.keyword) : '';
  const sort = sp.sort === 'likes' ? 'likes' : 'upload_at';
  const page = Math.max(1, Number(sp.page ?? 1));

  // 与原版 /skinlib/list 相同的查询语义
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (type === 'skin') conditions.push("t.type IN ('steve', 'alex')");
  else {
    conditions.push('t.type = ?');
    params.push(type);
  }
  if (keyword) {
    conditions.push('t.name LIKE ?');
    params.push(`%${keyword}%`);
  }
  if (uploader) {
    conditions.push('t.uploader = ?');
    params.push(uploader);
  }
  if (user && user.permission < PERMISSION.ADMIN) {
    conditions.push('(t.public = 1 OR t.uploader = ?)');
    params.push(user.uid);
  } else if (!user) {
    conditions.push('t.public = 1');
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRes = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM textures t ${where}`,
  )
    .bind(...params)
    .first<{ total: number }>();
  const total = totalRes?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));
  const currentPage = Math.min(page, lastPage);
  const offset = (currentPage - 1) * PER_PAGE;

  const { results } = await env.DB.prepare(
    `SELECT t.tid, t.name, t.type, t.uploader, t.public, t.likes, t.upload_at, u.nickname
     FROM textures t JOIN users u ON u.uid = t.uploader
     ${where} ORDER BY t.${sort} DESC LIMIT ? OFFSET ?`,
  )
    .bind(...params, PER_PAGE, offset)
    .all<TextureRow>();
  const items = results as TextureRow[];

  // 预计算翻译
  const [labelPrivate, labelUploader, labelUploadedBy, labelAllUsers, labelNewest, labelMostLiked] =
    await Promise.all([
      t('skinlib.private', {}, { locale }),
      t('skinlib.show.uploader', {}, { locale }),
      t('skinlib.filter.uploader', { uid: uploader ?? 0 }, { locale }),
      t('skinlib.filter.allUsers', {}, { locale }),
      t('skinlib.sort.time', {}, { locale }),
      t('skinlib.sort.likes', {}, { locale }),
    ]);

  const linkParams = { filter: type, keyword: keyword || undefined, uploader: uploader ? String(uploader) : undefined, sort };

  return (
    <Shell ctx={ctx} site={site} variant="explore" path="skinlib">
      <div className="content-wrapper">
        <section className="content">
          <div className="container">
            {/* 筛选栏 */}
            <div className="d-flex flex-wrap align-items-center py-3">
              <div className="btn-group mr-3" role="group">
                {[
                  { key: 'skin', label: '（任意模型）' },
                  { key: 'steve', label: '（Steve）' },
                  { key: 'alex', label: '（Alex）' },
                  { key: 'cape', label: '（披风）' },
                ].map((f) => (
                  <Link
                    key={f.key}
                    href={`/skinlib${buildQuery({ ...linkParams, filter: f.key })}`}
                    className={`btn btn-sm ${type === f.key ? 'btn-primary' : 'btn-outline-primary'}`}
                  >
                    {f.label}
                  </Link>
                ))}
              </div>

              <div className="btn-group mr-3" role="group">
                <Link
                  href={`/skinlib${buildQuery({ ...linkParams, sort: 'upload_at' })}`}
                  className={`btn btn-sm ${sort === 'upload_at' ? 'btn-primary' : 'btn-outline-primary'}`}
                >
                  {labelNewest}
                </Link>
                <Link
                  href={`/skinlib${buildQuery({ ...linkParams, sort: 'likes' })}`}
                  className={`btn btn-sm ${sort === 'likes' ? 'btn-primary' : 'btn-outline-primary'}`}
                >
                  {labelMostLiked}
                </Link>
              </div>

              <div className="btn-group" role="group">
                <Link
                  href={`/skinlib${buildQuery({ ...linkParams, uploader: undefined })}`}
                  className={`btn btn-sm ${!uploader ? 'btn-primary' : 'btn-outline-primary'}`}
                >
                  {labelAllUsers}
                </Link>
                {user && (
                  <Link
                    href={`/skinlib${buildQuery({ ...linkParams, uploader: String(user.uid) })}`}
                    className={`btn btn-sm ${uploader === user.uid ? 'btn-primary' : 'btn-outline-primary'}`}
                  >
                    我上传的
                  </Link>
                )}
              </div>

              {keyword && (
                <span className="ml-3 text-muted">
                  关键词：{keyword}
                  <Link href={`/skinlib${buildQuery({ ...linkParams, keyword: undefined })}`} className="ml-2">
                    清除筛选
                  </Link>
                </span>
              )}
            </div>

            {/* 网格 */}
            <div className="d-flex flex-wrap mb-3">
              {items.length === 0 && <div className="text-center w-100 py-5">无结果</div>}
              {items.map((item) => (
                <a
                  key={item.tid}
                  href={`/skinlib/show/${item.tid}`}
                  target="_blank"
                  className="ml-3 mr-2 mb-2 d-block"
                >
                  <div className="card" style={{ width: 245 }}>
                    <div className="card-body" style={{ backgroundColor: '#eff1f0' }}>
                      <img
                        src={`/preview/${item.tid}?height=150&png`}
                        alt={item.name}
                        className="card-img-top"
                        style={{ height: 210, objectFit: 'contain' }}
                      />
                    </div>
                    <div className="card-footer">
                      <div className="d-flex align-items-center">
                        {!item.public && (
                          <i className="fas fa-lock text-warning mr-2" title={labelPrivate} />
                        )}
                        <span className="d-block mb-1 text-truncate" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between">
                        <div className="d-flex">
                          <span className="badge bg-teal mr-1">{humanizeType(item.type)}</span>
                          <span
                            className="badge bg-indigo text-truncate"
                            title={labelUploader}
                            style={{ maxWidth: 100, cursor: 'pointer' }}
                          >
                            {item.nickname}
                          </span>
                        </div>
                        <span className="text-muted">
                          <i className="fas fa-heart mr-1" />
                          {item.likes}
                        </span>
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>

            {/* 分页 */}
            {lastPage > 1 && (
              <nav aria-label="Page navigation">
                <ul className="pagination justify-content-center">
                  {Array.from({ length: lastPage }, (_, i) => i + 1).map((p) => (
                    <li key={p} className={`page-item ${p === currentPage ? 'active' : ''}`}>
                      <Link
                        href={`/skinlib${buildQuery({ ...linkParams, page: String(p) })}`}
                        className="page-link"
                      >
                        {p}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        </section>
      </div>
    </Shell>
  );
}
