/**
 * OAuth2 授权页 (对应 Passport authorize 视图, RSC 渲染):
 *   客户端名称 + 权限范围 + 授权/拒绝
 * POST 提交到 /api/oauth/authorize (页面路径的 POST 被 page 拦截)
 */
import { redirect } from 'next/navigation';
import { getPageData } from '@/lib/server/page';
import { OAuthAuthorizeActions } from '@/components/oauth/OAuthAuthorizeActions';

export const dynamic = 'force-dynamic';

interface AuthorizeSearch {
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  response_type?: string;
}

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<AuthorizeSearch>;
}) {
  const sp = await searchParams;
  const { env, ctx } = await getPageData();

  if (!ctx.user) {
    redirect(`/auth/login?redirect=${encodeURIComponent('/oauth/authorize?' + new URLSearchParams(sp as Record<string, string>).toString())}`);
  }

  const clientId = Number(sp.client_id);
  const client = await env.DB.prepare(
    'SELECT id, name, redirect FROM oauth_clients WHERE id = ? AND revoked = 0 AND personal_access_client = 0 LIMIT 1',
  )
    .bind(clientId)
    .first<{ id: number; name: string; redirect: string }>();

  if (!client) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
        <div className="card" style={{ width: 420 }}>
          <div className="card-body text-center">
            <h4 className="mb-3">
              <i className="fas fa-shield-alt mr-2" />
              OAuth2 授权
            </h4>
            <div className="alert alert-danger">授权请求无效 (客户端不存在或已撤销)</div>
          </div>
        </div>
      </div>
    );
  }

  const scopes = (sp.scope ?? '').split(' ').filter(Boolean);

  return (
    <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
      <div className="card" style={{ width: 420 }}>
        <div className="card-body">
          <h4 className="text-center mb-4">
            <i className="fas fa-shield-alt mr-2" />
            OAuth2 授权
          </h4>
          <p>
            <strong>{client.name}</strong> 请求访问你的账号：
          </p>
          <p className="text-muted">{ctx.user.nickname || ctx.user.email}</p>
          {scopes.length > 0 && (
            <ul className="list-group mb-3">
              {scopes.map((s) => (
                <li key={s} className="list-group-item">
                  {s}
                </li>
              ))}
            </ul>
          )}
          <OAuthAuthorizeActions
            clientId={client.id}
            redirectUri={sp.redirect_uri ?? client.redirect}
            scope={sp.scope ?? ''}
            state={sp.state ?? ''}
          />
        </div>
      </div>
    </div>
  );
}
