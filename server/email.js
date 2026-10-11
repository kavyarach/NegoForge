import nodemailer from 'nodemailer';
import { dbRun, dbGet } from './db.js';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'NegoForge <noreply@negoforge.com>';

export function getEmailStatus() {
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return { configured: true, host: SMTP_HOST, user: SMTP_USER };
  }
  return { configured: false, host: null, user: null, message: 'SMTP credentials not configured in environment variables' };
}

/**
 * Creates Nodemailer transporter if configured
 */
function createTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

/**
 * Sends result email for a negotiation report.
 */
export async function sendNegotiationReportEmail({ recipientEmail, report, userId = null }) {
  if (!recipientEmail || !report) {
    throw new Error('Recipient email and report are required');
  }

  const logId = `eml_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  // Prevent duplicate sending for exact same session within 1 minute
  const recentDuplicate = await dbGet(
    `SELECT * FROM email_logs WHERE session_id = ? AND recipient_email = ? AND status = 'SENT' AND sent_at > datetime('now', '-1 minute')`,
    [report.negotiationId, recipientEmail]
  );

  if (recentDuplicate) {
    return {
      success: true,
      duplicatePrevented: true,
      message: 'Email was already sent recently to this recipient for this negotiation session.',
    };
  }

  const statusConfig = getEmailStatus();

  // Build Branded HTML Email Content
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f1f5f9; padding: 32px; borderRadius: 12px; max-width: 600px; margin: 0 auto;">
      <div style="border-bottom: 2px solid #263248; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="color: #38bdf8; margin: 0; font-size: 24px;">NegoForge Outcome Report</h1>
        <p style="color: #a8b3c7; margin: 4px 0 0 0; font-size: 14px;">Scenario: ${report.scenarioTitle}</p>
      </div>

      <div style="background-color: #111827; border: 1px solid #263248; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: ${report.status === 'AGREEMENT' ? '#10b981' : '#f59e0b'};">
          Status: ${report.status === 'AGREEMENT' ? 'AGREEMENT REACHED ✅' : report.status}
        </h3>
        <p style="font-size: 16px; margin: 8px 0;"><strong>Final Result:</strong> ${report.agreementTerm}</p>
        <p style="font-size: 14px; color: #a8b3c7; margin: 4px 0;">Rounds Elapsed: ${report.roundsTaken} | Negotiation Score: ${report.negotiationScore}/100</p>
      </div>

      <div style="margin-bottom: 24px;">
        <h4 style="color: #38bdf8; margin-bottom: 12px;">Strategic Key Takeaways:</h4>
        <ul style="color: #cbd5e1; padding-left: 20px; line-height: 1.6;">
          ${(report.takeaways || []).map((t) => `<li>${t}</li>`).join('')}
        </ul>
      </div>

      <div style="border-top: 1px solid #263248; padding-top: 16px; text-align: center; color: #64748b; font-size: 12px;">
        Sent automatically by NegoForge Negotiation Intelligence Platform.
      </div>
    </div>
  `;

  if (!statusConfig.configured) {
    // Log as honest unconfigured simulation status
    await dbRun(
      `INSERT INTO email_logs (id, user_id, session_id, recipient_email, status, error_message, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [logId, userId, report.negotiationId, recipientEmail, 'NOT_CONFIGURED', 'SMTP credentials not configured in environment', now]
    );

    return {
      success: false,
      configured: false,
      message: 'Email service is not configured with SMTP credentials. Report logged cleanly in DB.',
    };
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: SMTP_FROM,
      to: recipientEmail,
      subject: `NegoForge Outcome Report: ${report.scenarioTitle} (${report.status})`,
      html: htmlContent,
    });

    await dbRun(
      `INSERT INTO email_logs (id, user_id, session_id, recipient_email, status, error_message, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [logId, userId, report.negotiationId, recipientEmail, 'SENT', null, now]
    );

    return {
      success: true,
      configured: true,
      message: `Email report delivered successfully to ${recipientEmail}`,
    };
  } catch (err) {
    console.error('Failed to send email:', err.message);

    await dbRun(
      `INSERT INTO email_logs (id, user_id, session_id, recipient_email, status, error_message, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [logId, userId, report.negotiationId, recipientEmail, 'FAILED', err.message, now]
    );

    return {
      success: false,
      configured: true,
      message: `Failed to deliver email: ${err.message}`,
    };
  }
}
