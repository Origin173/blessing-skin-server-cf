/**
 * 材质上传页 (对照 skinlib/upload.twig):
 *   content-header 标题 + <UploadForm />
 * 需要登录 (AuthGuard 语义: 未登录跳登录页)
 */
import { redirect } from 'next/navigation';
import { t } from '@/lib/server/i18n';
import { getOption } from '@/lib/server/options';
import { getPageData } from '@/lib/server/page';
import { Shell } from '@/components/layout/Shell';
import { UploadForm } from '@/components/skinlib/UploadForm';

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const { env, ctx, site } = await getPageData();
  const locale = ctx.locale;

  if (!ctx.user) {
    redirect('/auth/login?redirect=/skinlib/upload');
  }

  const nameRule = String((await getOption(env, 'texture_name_regexp')) ?? '');
  const contentPolicy = String((await getOption(env, 'content_policy')) ?? '');

  return (
    <Shell ctx={ctx} site={site} variant="user" path="skinlib/upload">
      <div className="container-fluid">
        <div className="content-header">
          <div className="container-fluid">
            <div className="d-flex justify-content-between flex-wrap">
              <div>
                <h1 className="m-0">{await t('skinlib.upload.title', {}, { locale })}</h1>
              </div>
              <div>
                <div className="breadcrumb" />
              </div>
            </div>
          </div>
        </div>
        <section className="content">
          <div className="container-fluid">
            <UploadForm nameRule={nameRule} contentPolicy={contentPolicy} />
          </div>
        </section>
      </div>
    </Shell>
  );
}
