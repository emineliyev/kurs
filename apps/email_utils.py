"""
Shared HTML email builder for Kursum platform.
All emails use inline CSS for maximum email-client compatibility.
"""

_C_PRIMARY = '#1e40af'
_C_SUCCESS = '#059669'
_C_DANGER  = '#dc2626'
_C_MUTED   = '#64748b'


def email_shell(header_color: str, icon: str, title: str, body_html: str) -> str:
    """Wrap content in a branded, responsive email shell."""
    return f"""<!DOCTYPE html>
<html lang="az">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">

        <!-- Logo -->
        <tr><td style="padding:0 0 20px;text-align:center;">
          <span style="font-size:20px;font-weight:800;color:{_C_PRIMARY};letter-spacing:-0.5px;">
            📚 Kursum
          </span>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#fff;border-radius:16px;overflow:hidden;
                        box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header stripe -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:{header_color};padding:32px 40px;text-align:center;">
              <div style="font-size:44px;line-height:1;margin-bottom:14px;">{icon}</div>
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;
                          letter-spacing:-0.3px;">{title}</h1>
            </td></tr>
          </table>

          <!-- Body -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:36px 40px;">
              {body_html}
            </td></tr>
          </table>

          <!-- Footer -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:20px 40px;border-top:1px solid #f1f5f9;
                            background:#f8fafc;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © 2025 Kursum Platforması &nbsp;·&nbsp; Bütün hüquqlar qorunur
              </p>
            </td></tr>
          </table>

        </td></tr>
      </table>
    </td></tr>
  </table>

</body>
</html>"""


def info_table(rows: list[tuple], bg='#f8fafc') -> str:
    """
    Render a key-value info table.
    rows = [('Label', 'Value'), ...]
    """
    cells = ''.join(
        f"""<tr>
          <td style="padding:11px 16px;font-size:13px;color:{_C_MUTED};font-weight:600;
                     white-space:nowrap;border-bottom:1px solid #f1f5f9;width:38%;">{label}</td>
          <td style="padding:11px 16px;font-size:13px;color:#1e293b;font-weight:500;
                     border-bottom:1px solid #f1f5f9;">{value}</td>
        </tr>"""
        for label, value in rows
    )
    return (
        f'<table width="100%" cellpadding="0" cellspacing="0" '
        f'style="background:{bg};border-radius:10px;overflow:hidden;margin-bottom:28px;">'
        f'{cells}</table>'
    )


def cta_button(label: str, url: str, color: str = _C_PRIMARY) -> str:
    """Render a centered call-to-action button."""
    return (
        f'<div style="text-align:center;margin-bottom:8px;">'
        f'<a href="{url}" style="display:inline-block;background:{color};color:#fff;'
        f'text-decoration:none;font-size:14px;font-weight:600;'
        f'padding:13px 36px;border-radius:8px;">{label} →</a>'
        f'</div>'
    )


def greeting(name: str) -> str:
    return (
        f'<p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1e293b;">'
        f'Salam, {name}!</p>'
    )


def paragraph(text: str, bottom_margin='24px') -> str:
    return (
        f'<p style="margin:0 0 {bottom_margin};font-size:15px;color:#475569;line-height:1.65;">'
        f'{text}</p>'
    )


def note(text: str) -> str:
    return (
        f'<p style="margin:24px 0 0;font-size:13px;color:#94a3b8;text-align:center;">'
        f'{text}</p>'
    )
