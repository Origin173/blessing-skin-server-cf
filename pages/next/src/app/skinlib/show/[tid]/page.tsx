/**
 * 材质详情页 (对照 skinlib/show.twig + shared/grid.twig + 原版 Show 组件):
 *   md-8: 3D 预览 (shared.previewer) | md-4: 信息卡片 (名称/模型/大小/上传者/日期/收藏/操作)
 */
import { notFound } from 'next/navigation';
import { t } from '@/lib/server/i18n';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { Shell } from '@/components/layout/Shell';
import { Viewer3d } from '@/components/skinlib/Viewer3d';
import { ShowActions } from '@/components/skinlib/ShowActions';
import type { TextureRow, UserRow } from '@/lib/server/types';

export const dynamic = 'force-dynamic';

interface ShowPageProps {
  params: Promise<{ tid: string }>;
}

function humanizeType(type: string): string {
  if (type === 'alex') return 'Alex';
  if (type === 'cape') return '披风';
  return 'Steve';
}

export default async function ShowPage({ params }: ShowPageProps) {
  const { tid } = await params;
  const { env, ctx, site } = await getPageData();
  const locale = ctx.locale;
  const user = ctx.user;

  const texture = await env.DB.prepare('SELECT * FROM textures WHERE tid = ? LIMIT 1')
    .bind(Number(tid))
    .first<TextureRow>();
  if (!texture) notFound();

  // 隐私检查 (与原版 privacy 中间件一致)
  if (!texture.public) {
    const allowed = user && (user.uid === texture.uploader || user.permission >= PERMISSION.ADMIN);
    if (!allowed) {
      const statusCode = Number((await import('@/lib/server/options')).getOption(env, 'status_code_for_private', 404));
      if (statusCode === 404) notFound();
      notFound();
    }
  }

  const uploader = await env.DB.prepare('SELECT uid, nickname, permission FROM users WHERE uid = ? LIMIT 1')
    .bind(texture.uploader)
    .first<Pick<UserRow, 'uid' | 'nickname' | 'permission'>>();
  const nickname = uploader?.nickname ?? (await t('general.unexistent-user', {}, { locale }));
  const isAdmin = user ? user.permission >= PERMISSION.ADMIN : false;
  const isOwner = user ? user.uid === texture.uploader : false;

  const [labelTitle, labelDetail, labelName, labelModel, labelSize, labelUploader, labelUploadAt, labelLikes, labelDownload, labelPrivate] =
    await Promise.all([
      t('skinlib.show.title', {}, { locale }),
      t('skinlib.show.detail', {}, { locale }),
      t('skinlib.show.name', {}, { locale }),
      t('skinlib.show.model', {}, { locale }),
      t('skinlib.show.size', {}, { locale }),
      t('skinlib.show.uploader', {}, { locale }),
      t('skinlib.show.upload-at', {}, { locale }),
      t('skinlib.show.likes', {}, { locale }),
      t('skinlib.show.download', {}, { locale }),
      t('skinlib.private', {}, { locale }),
    ]);

  const sizeKb = (texture.size / 1024).toFixed(2);
  const previewPng = `/preview/${texture.tid}?height=150&png`;

  return (
    <Shell ctx={ctx} site={site} variant="explore" path={`skinlib/show/${texture.tid}`}>
      <div className="content-wrapper">
        <div className="container">
          <div className="content-header">
            <div className="container-fluid">
              <div className="d-flex justify-content-between flex-wrap">
                <div>
                  <h1 className="m-0">{labelTitle}</h1>
                </div>
                <div>
                  <div className="breadcrumb" />
                </div>
              </div>
            </div>
          </div>

          <section className="content">
            <div className="container-fluid">
              <div className="row">
                <div className="col-md-8">
                  <Viewer3d
                    skin={texture.type === 'cape' ? undefined : `/preview/${texture.tid}?height=200&png`}
                    cape={texture.type === 'cape' ? previewPng : undefined}
                    isAlex={texture.type === 'alex'}
                  />
                </div>
                <div className="col-md-4">
                  <div className="card">
                    <div className="card-header">
                      <h3 className="card-title">{labelDetail}</h3>
                    </div>
                    <div className="card-body">
                      <table className="table">
                        <tbody>
                          <tr>
                            <th>{labelName}</th>
                            <td>
                              {texture.name}
                              {!texture.public && (
                                <i className="fas fa-lock text-warning ml-1" title={labelPrivate} />
                              )}
                            </td>
                          </tr>
                          <tr>
                            <th>{labelModel}</th>
                            <td>{humanizeType(texture.type)}</td>
                          </tr>
                          <tr>
                            <th>{labelSize}</th>
                            <td>{sizeKb} KB</td>
                          </tr>
                          <tr>
                            <th>{labelUploader}</th>
                            <td>
                              {nickname}
                              {uploader?.permission !== undefined && uploader.permission >= 1 && (
                                <span className="badge bg-primary ml-1">STAFF</span>
                              )}
                            </td>
                          </tr>
                          <tr>
                            <th>{labelUploadAt}</th>
                            <td>{texture.upload_at}</td>
                          </tr>
                          <tr>
                            <th>{labelLikes}</th>
                            <td>{texture.likes}</td>
                          </tr>
                        </tbody>
                      </table>

                      <ShowActions
                        tid={texture.tid}
                        type={texture.type}
                        canManage={isAdmin || isOwner}
                        allowDownload={true}
                        loggedIn={!!user}
                        isPublic={texture.public === 1}
                        textureName={texture.name}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
