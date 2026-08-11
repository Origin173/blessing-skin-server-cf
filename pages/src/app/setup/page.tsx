/**
 * 安装向导页 (RSC 壳): 注入前端 i18n (window.__I18N) 后渲染 SetupWizard client 组件。
 * 向导逻辑在 src/components/setup/SetupWizard.tsx (对照 setup/base.twig + wizard/*.twig)。
 */
import { getPageData } from '@/lib/server/page';
import { loadBundle } from '@/lib/server/i18n';
import SetupWizard from '@/components/setup/SetupWizard';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const { ctx } = await getPageData();
  const i18nBundle = await loadBundle(ctx.locale);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: `window.__I18N = ${JSON.stringify(i18nBundle)};` }}
      />
      <SetupWizard />
    </>
  );
}
