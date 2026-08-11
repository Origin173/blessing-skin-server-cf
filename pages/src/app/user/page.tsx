/**
 * 用户仪表盘 (对照 user/index.twig + user/widgets/dashboard/*):
 *   md-7: 使用情况卡片 (角色数/存储/当前积分 InfoBox) + 签到按钮
 *   md-5: 公告卡片 (Markdown → HTML)
 */
import { redirect } from 'next/navigation';
import { t } from '@/lib/server/i18n';
import { boolOption, intOption } from '@/lib/server/options';
import { getPageData } from '@/lib/server/page';
import { Shell } from '@/components/layout/Shell';
import { SignButton } from '@/components/user/SignButton';

export const dynamic = 'force-dynamic';

export default async function UserHomePage() {
  const { env, ctx, site } = await getPageData();
  const locale = ctx.locale;

  if (!ctx.user) {
    redirect('/auth/login?redirect=/user');
  }
  const user = ctx.user;

  const [playersCount, storageKb, announcement, signGap, canSignAfterZero, ratePlayers, rateStorage] =
    await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS total FROM players WHERE uid = ?')
        .bind(user.uid)
        .first<{ total: number }>()
        .then((r) => r?.total ?? 0),
      env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM textures WHERE uploader = ?')
        .bind(user.uid)
        .first<{ total: number }>()
        .then((r) => r?.total ?? 0),
      // 公告 (Markdown → 简化 HTML: 段落/链接)
      (async () => {
        const raw = String((await import('@/lib/server/options')).getOption(env, 'announcement') ?? '');
        return raw
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\n/g, '<br/>');
      })(),
      intOption(env, 'sign_gap_time').then((v) => (Number.isFinite(v) ? v : 24)),
      boolOption(env, 'sign_after_zero'),
      intOption(env, 'score_per_player').then((v) => (Number.isFinite(v) ? v : 100)),
      intOption(env, 'score_per_storage').then((v) => (Number.isFinite(v) ? v : 1)),
    ]);

  const [labelUsage, labelPlayers, labelStorage, labelScore, labelScoreNotice, labelAnnouncement] =
    await Promise.all([
      t('user.used.title', {}, { locale }),
      t('user.used.players', {}, { locale }),
      t('user.used.storage', {}, { locale }),
      t('user.cur-score', {}, { locale }),
      t('user.score-notice', {}, { locale }),
      t('user.announcement', {}, { locale }),
    ]);

  const score = user.score;
  const totalPlayers = ~~(playersCount + score / Math.max(1, ratePlayers));
  const totalStorage = storageKb > 1024
    ? ~~(storageKb / 1024 + score / Math.max(1, rateStorage) / 1024)
    : ~~(storageKb + score / Math.max(1, rateStorage));
  const storageUnit = storageKb > 1024 ? 'MB' : 'KB';

  const infoBox = (color: string, icon: string, name: string, used: number, total: number, unit: string) => {
    const percentage = total > 0 ? Math.min(100, (used / total) * 100) : 0;
    return (
      <div className={`info-box bg-${color}`}>
        <span className="info-box-icon">
          <i className={`fas fa-${icon}`} />
        </span>
        <div className="info-box-content">
          <span className="info-box-text">{name}</span>
          <span className="info-box-number">
            <b>{used}</b> / {total} {unit}
          </span>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${percentage}%` }} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <Shell ctx={ctx} site={site} variant="user" path="user">
      <div className="row">
        <div className="col-md-7">
          <div className="card card-primary card-outline">
            <div className="card-header">
              <h3 className="card-title">{labelUsage}</h3>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-1" />
                <div className="col-md-6">
                  {infoBox('teal', 'gamepad', labelPlayers, playersCount, totalPlayers, '')}
                  {infoBox('maroon', 'hdd', labelStorage, storageKb > 1024 ? ~~(storageKb / 1024) : storageKb, totalStorage, storageUnit)}
                </div>
                <div className="col-md-4 text-center">
                  <p style={{ fontWeight: 'bold', marginTop: 5 }}>{labelScore}</p>
                  <p
                    style={{ fontFamily: 'Minecraft', fontSize: 50, marginTop: 20, cursor: 'help' }}
                    title={labelScoreNotice}
                  >
                    {score}
                  </p>
                  <p style={{ fontSize: 'smaller', marginTop: 20 }}>{labelScoreNotice}</p>
                </div>
              </div>
            </div>
            <div className="card-footer">
              <SignButton lastSignAt={user.last_sign_at} signGap={signGap} canSignAfterZero={canSignAfterZero} />
            </div>
          </div>
        </div>
        <div className="col-md-5">
          <div className="card card-primary card-outline">
            <div className="card-header">
              <h3 className="card-title">{labelAnnouncement}</h3>
            </div>
            <div className="card-body">
              <div dangerouslySetInnerHTML={{ __html: announcement }} />
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
