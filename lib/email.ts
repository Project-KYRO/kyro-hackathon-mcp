import { Resend } from 'resend';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Missing RESEND_API_KEY env.');
  _resend = new Resend(apiKey);
  return _resend;
}

function getFrom(): string {
  return (
    process.env.RESEND_FROM_EMAIL ||
    'KYRO Hackathon <onboarding@resend.dev>'
  );
}

export async function sendOtpEmail(to: string, otp: string) {
  return getResend().emails.send({
    from: getFrom(),
    to,
    subject: `KYRO Hackathon 인증 코드 ${otp}`,
    text:
      `KYRO Hackathon API 토큰 발급 인증 코드입니다.\n\n` +
      `${otp}\n\n` +
      `10분 안에 입력해주세요. 본인이 요청하지 않았다면 이 메일은 무시하세요.`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,Pretendard,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;line-height:1.6">
        <h2 style="margin:0 0 16px">KYRO Hackathon</h2>
        <p style="color:#52525b;margin:0 0 24px">API 토큰 발급 인증 코드</p>
        <div style="background:#0a0a0a;color:#22c55e;font-size:32px;letter-spacing:8px;font-weight:700;padding:24px;text-align:center;border-radius:8px;font-family:ui-monospace,SFMono-Regular,monospace">
          ${otp}
        </div>
        <p style="color:#52525b;margin:24px 0 0;font-size:14px">10분 안에 입력해주세요. 본인이 요청하지 않았다면 이 메일은 무시하세요.</p>
      </div>
    `,
  });
}
