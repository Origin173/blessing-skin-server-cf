'use client';

/** 签到按钮 (对照原版 SignButton + scoreUtils): 可签到/剩余时间显示 */
import { useEffect, useState } from 'react';

interface SignButtonProps {
  lastSignAt: string;
  signGap: number;
  canSignAfterZero: boolean;
}

const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;

function remainingTime(lastSign: Date, signGap: number, canSignAfterZero: boolean): number {
  if (canSignAfterZero) {
    const today = new Date().setHours(0, 0, 0, 0);
    const tomorrow = today + ONE_DAY;
    const rest = tomorrow - Date.now();
    return lastSign.valueOf() < today ? 0 : rest;
  }
  return lastSign.valueOf() + signGap * ONE_HOUR - Date.now();
}

export function SignButton({ lastSignAt, signGap, canSignAfterZero }: SignButtonProps) {
  const [loading, setLoading] = useState(false);
  const [signed, setSigned] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const lastSign = new Date(lastSignAt.replace(' ', 'T'));
  const remaining = remainingTime(lastSign, signGap, canSignAfterZero);
  const canSign = remaining <= 0;

  const remainingText = (() => {
    const time = remaining / ONE_MINUTE;
    return time < 60
      ? `${~~time} 分钟后可签到`
      : `${~~(time / 60)} 小时后可签到`;
  })();

  const csrf =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
      : '';

  const handleSign = async () => {
    setLoading(true);
    try {
      const res = await fetch('/user/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
        body: '{}',
      });
      const body = (await res.json().catch(() => ({}))) as { code?: number; data?: { score?: number } };
      if (body.code === 0) {
        setSigned(true);
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className="btn bg-gradient-primary pl-4 pr-4"
      role="button"
      disabled={!canSign || loading}
      onClick={handleSign}
    >
      <i className="far fa-calendar-check" aria-hidden="true" /> &nbsp;
      {signed ? '签到成功' : canSign ? '签到' : remainingText}
    </button>
  );
}
