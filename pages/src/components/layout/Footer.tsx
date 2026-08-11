/**
 * 页脚 (对照 shared/footer.twig + copyright.twig)。
 */
import type { AppContext } from '@/lib/server/context';
import type { SiteData } from '@/lib/server/site';
import { renderCopyright } from '@/lib/server/site';

interface FooterProps {
  ctx: AppContext;
  site: SiteData;
}

export async function Footer({ ctx, site }: FooterProps) {
  const copyrightHtml = await renderCopyright(ctx.env, ctx, site);
  return (
    <footer className="main-footer">
      <div dangerouslySetInnerHTML={{ __html: copyrightHtml }} />
    </footer>
  );
}
