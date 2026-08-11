/**
 * 个人资料页 (对照 user/profile.twig): <ProfileForm />
 */
import { redirect } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { Shell } from '@/components/layout/Shell';
import { ProfileForm } from '@/components/user/ProfileForm';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { ctx, site } = await getPageData();

  if (!ctx.user) {
    redirect('/auth/login?redirect=/user/profile');
  }

  return (
    <Shell ctx={ctx} site={site} variant="user" path="user/profile">
      <ProfileForm
        nickname={ctx.user.nickname}
        email={ctx.user.email}
        siteName={site.siteName}
        isAdmin={ctx.user.permission >= 1}
      />
    </Shell>
  );
}
