/**
 * 管理仪表盘 (对照 admin/index.twig + widgets/dashboard/*):
 *   统计 small-box (用户/角色/材质/存储) + 近 31 天注册/上传统计 + 发送通知
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { t } from '@/lib/server/i18n';
import { getPageData } from '@/lib/server/page';
import { PERMISSION } from '@/lib/server/types';
import { Shell } from '@/components/layout/Shell';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const { env, ctx, site } = await getPageData();
  const locale = ctx.locale;

  if (!ctx.user || ctx.user.permission < PERMISSION.ADMIN) {
    redirect('/auth/login?redirect=/admin');
  }

  const [users, players, textures, storage] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS total FROM users').first<{ total: number }>().then((r) => r?.total ?? 0),
    env.DB.prepare('SELECT COUNT(*) AS total FROM players').first<{ total: number }>().then((r) => r?.total ?? 0),
    env.DB.prepare('SELECT COUNT(*) AS total FROM textures').first<{ total: number }>().then((r) => r?.total ?? 0),
    env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM textures').first<{ total: number }>().then((r) => r?.total ?? 0),
  ]);

  // 近 31 天注册/上传统计
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 31);
  const monthAgoStr = `${monthAgo.getFullYear()}-${String(monthAgo.getMonth() + 1).padStart(2, '0')}-${String(monthAgo.getDate()).padStart(2, '0')} 00:00:00`;
  const [registers, uploads] = await Promise.all([
    env.DB.prepare("SELECT substr(register_at, 1, 10) AS day, COUNT(*) AS total FROM users WHERE register_at >= ? GROUP BY day")
      .bind(monthAgoStr)
      .all<{ day: string; total: number }>(),
    env.DB.prepare("SELECT substr(upload_at, 1, 10) AS day, COUNT(*) AS total FROM textures WHERE upload_at >= ? GROUP BY day")
      .bind(monthAgoStr)
      .all<{ day: string; total: number }>(),
  ]);

  const [labelUsers, labelPlayers, labelTextures, labelStorage, labelUserManage, labelPlayerManage, labelOverview] =
    await Promise.all([
      t('admin.index.total-users', {}, { locale }),
      t('admin.index.total-players', {}, { locale }),
      t('admin.index.total-textures', {}, { locale }),
      t('admin.index.disk-usage', {}, { locale }),
      t('general.user-manage', {}, { locale }),
      t('general.player-manage', {}, { locale }),
      t('admin.index.overview', {}, { locale }),
    ]);

  const storageText = storage > 1024 * 1024
    ? `${(storage / 1024 / 1024).toFixed(1)}GB`
    : storage > 1024
      ? `${(storage / 1024).toFixed(1)}MB`
      : `${storage}KB`;

  return (
    <Shell ctx={ctx} site={site} variant="admin" path="admin">
      <div className="row">
        <div className="col-md-6">
          <div className="small-box bg-info">
            <div className="inner">
              <h3>{users}</h3>
              <p>{labelUsers}</p>
            </div>
            <div className="icon">
              <i className="fas fa-users" />
            </div>
            <Link href="/admin/users" className="small-box-footer">
              {labelUserManage}&nbsp;
              <i className="fa fa-arrow-circle-right" />
            </Link>
          </div>
        </div>
        <div className="col-md-6">
          <div className="small-box bg-green">
            <div className="inner">
              <h3>{players}</h3>
              <p>{labelPlayers}</p>
            </div>
            <div className="icon">
              <i className="fas fa-gamepad" />
            </div>
            <Link href="/admin/players" className="small-box-footer">
              {labelPlayerManage}&nbsp;
              <i className="fa fa-arrow-circle-right" />
            </Link>
          </div>
        </div>
      </div>
      <div className="row">
        <div className="col-md-6">
          <div className="small-box bg-purple">
            <div className="inner">
              <h3>{textures}</h3>
              <p>{labelTextures}</p>
            </div>
            <div className="icon">
              <i className="fas fa-file" />
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="small-box bg-yellow">
            <div className="inner">
              <h3>{storageText}</h3>
              <p>{labelStorage}</p>
            </div>
            <div className="icon">
              <i className="fas fa-hdd" />
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">{labelOverview}</h3>
            </div>
            <div className="card-body">
              <p>
                <strong>注册用户（近 31 天）</strong>
              </p>
              <ul className="list-group">
                {(registers.results as { day: string; total: number }[]).slice(-14).map((r) => (
                  <li key={r.day} className="list-group-item d-flex justify-content-between">
                    <span>{r.day}</span>
                    <span className="badge bg-primary">{r.total}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3">
                <strong>材质上传（近 31 天）</strong>
              </p>
              <ul className="list-group">
                {(uploads.results as { day: string; total: number }[]).slice(-14).map((r) => (
                  <li key={r.day} className="list-group-item d-flex justify-content-between">
                    <span>{r.day}</span>
                    <span className="badge bg-success">{r.total}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
