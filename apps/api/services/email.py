"""Outbound email over SMTP.

Without SMTP_HOST configured, emails aren't sent — the full message (including
any action link) is written to the API log so the flows stay testable in dev.
"""
import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import settings

logger = logging.getLogger(__name__)


def _send_sync(to: str, subject: str, html: str, text: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    if settings.SMTP_PORT == 465:
        server: smtplib.SMTP = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
    else:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
        if settings.SMTP_TLS:
            server.starttls()
    try:
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)
    finally:
        server.quit()


async def send_email(to: str, subject: str, html: str, text: str | None = None) -> bool:
    """True if handed to SMTP (or logged in dev mode); False on send failure."""
    text = text or html
    if not settings.SMTP_HOST:
        logger.info("EMAIL (dev mode, not sent) to=%s subject=%r body=%r", to, subject, text)
        return True
    try:
        await asyncio.to_thread(_send_sync, to, subject, html, text)
        return True
    except Exception as exc:
        logger.error("Email send failed to=%s subject=%r: %s", to, subject, exc)
        return False


def _button_email(title: str, body: str, link: str, cta: str) -> tuple[str, str]:
    """(html, text) for a simple call-to-action email."""
    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 12px">{title}</h2>
      <p style="color:#444;line-height:1.5">{body}</p>
      <p style="margin:24px 0">
        <a href="{link}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">{cta}</a>
      </p>
      <p style="color:#888;font-size:12px">Or paste this link into your browser:<br>{link}</p>
    </div>
    """
    text = f"{title}\n\n{body}\n\n{cta}: {link}\n"
    return html, text


async def send_verification_email(to: str, token: str) -> bool:
    link = f"{settings.WEB_BASE_URL}/verify-email?token={token}"
    html, text = _button_email(
        "Confirm your email",
        "Welcome to Gravel! Confirm this email address to finish setting up your account.",
        link, "Confirm email",
    )
    return await send_email(to, "Confirm your Gravel email", html, text)


async def send_password_reset_email(to: str, token: str) -> bool:
    link = f"{settings.WEB_BASE_URL}/reset-password?token={token}"
    html, text = _button_email(
        "Reset your password",
        "Someone requested a password reset for your Gravel account. "
        "The link expires in 30 minutes. If this wasn't you, ignore this email.",
        link, "Reset password",
    )
    return await send_email(to, "Reset your Gravel password", html, text)
