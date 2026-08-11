#!/bin/bash
# 最终验证 runner: 清理 → 起 worker → 轮询 → 跑全套测试 → 清理
set -e
cd /d/Code/blessing-skin-server-cf/pages/next

PORT=8830
STATE=.wrangler-final2

echo "=== 1. 清理残留进程 ==="
wmic process where "name='node.exe'" get processid,commandline 2>/dev/null | grep -i "wrangler" | grep -oE "[0-9]+\s*$" | while read p; do taskkill //F //T //PID $p 2>/dev/null; done || true
taskkill //F //IM workerd.exe 2>/dev/null || true
sleep 4

echo "=== 2. 准备状态目录 ==="
rm -rf $STATE
npx wrangler d1 execute blessingskin --local --persist-to $STATE --file ../migrations/0001_schema.sql > /dev/null 2>&1
npx wrangler d1 execute blessingskin --local --persist-to $STATE --file ../migrations/0002_seed_options.sql > /dev/null 2>&1
npx wrangler d1 execute blessingskin --local --persist-to $STATE --file ../migrations/0003_install_state.sql > /dev/null 2>&1
npx wrangler d1 execute blessingskin --local --persist-to $STATE --file ../migrations/0004_plugin_protocol.sql > /dev/null 2>&1
npx wrangler d1 execute blessingskin --local --persist-to $STATE --command "INSERT OR IGNORE INTO plugin_manifests (name, manifest_json, readme, enabled, source, installed_at, updated_at) VALUES ('smoke-plugin', '{\"name\":\"smoke-plugin\",\"version\":\"1.0.0\"}', NULL, 1, 'upload', datetime('now'), datetime('now'))" > /dev/null 2>&1

echo "=== 3. 启动 worker ==="
npx wrangler dev .open-next/worker.js --port $PORT --local --persist-to $STATE > /tmp/wr-final.log 2>&1 &
WRANGLER_PID=$!

OK=0
for i in $(seq 1 20); do
  code=$(curl -s -m 4 -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/ 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then OK=1; break; fi
  sleep 4
done
if [ "$OK" != "1" ]; then
  echo "FAIL: worker 未就绪 (最后状态 $code)"
  tail -5 /tmp/wr-final.log
  kill $WRANGLER_PID 2>/dev/null || true
  exit 1
fi
echo "worker 就绪 ✓"

echo "=== 4. smoke-e2e ==="
SMOKE_BASE=http://127.0.0.1:$PORT node scripts/smoke-e2e.mjs > /tmp/final-e2e.txt 2>&1 || true
grep -cE "✓" /tmp/final-e2e.txt || true
grep -cE "✗" /tmp/final-e2e.txt || true
grep -E "全部通过|失败" /tmp/final-e2e.txt | tail -2 || true

echo "=== 5. oauth-test ==="
SMOKE_BASE=http://127.0.0.1:$PORT node scripts/oauth-test.mjs > /tmp/final-oauth.txt 2>&1 || true
grep -E "✓|✗|通过|失败" /tmp/final-oauth.txt | tail -12 || true

echo "=== 6. 页面可达性 (登录后) ==="
curl -s -m 6 -o /dev/null -w "/admin/plugins/market: %{http_code}\n" http://127.0.0.1:$PORT/admin/plugins/market
curl -s -m 6 -o /dev/null -w "/setup: %{http_code}\n" http://127.0.0.1:$PORT/setup
curl -s -m 6 -o /dev/null -w "/oauth/authorize: %{http_code}\n" http://127.0.0.1:$PORT/oauth/authorize
curl -s -m 6 http://127.0.0.1:$PORT/plugins/smoke/ping

echo "=== 7. 清理 ==="
kill $WRANGLER_PID 2>/dev/null || true
taskkill //F //IM workerd.exe 2>/dev/null || true
echo "完成"
