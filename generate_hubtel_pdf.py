import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            super().showPage()
        super().save()

    def draw_page_number(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 9)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(54, 36, "BoostUp Ghana — Hubtel API Integration Architecture & Flow")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(612 - 54, 36, page_text)
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 48, 612 - 54, 48)
        self.restoreState()

def generate_pdf():
    pdf_path = r"c:\Users\DELL\Desktop\ephraim\myfolder\app\Hubtel_Integration_Flow.pdf"
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#0F172A")
    )
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#0284C7")
    )
    h1_style = ParagraphStyle(
        'H1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=19,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=12,
        spaceAfter=6
    )
    h2_style = ParagraphStyle(
        'H2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#0369A1"),
        spaceBefore=8,
        spaceAfter=4
    )
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"),
        spaceBefore=4,
        spaceAfter=4
    )
    bullet_style = ParagraphStyle(
        'Bullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#1E293B"),
        leftIndent=14,
        spaceBefore=2,
        spaceAfter=2
    )
    code_style = ParagraphStyle(
        'CodeSnippet',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor("#0F172A"),
        backColor=colors.HexColor("#F1F5F9"),
        borderPadding=6,
        spaceBefore=4,
        spaceAfter=4
    )

    elements = []

    # Document Header
    elements.append(Paragraph("Hubtel API Integration Architecture & Flow", title_style))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph("BoostUp Ghana (boostupgh.com) — Merchant UAT & Production Certification Document", subtitle_style))
    elements.append(Spacer(1, 14))

    # Meta Table
    meta_data = [
        [Paragraph("<b>Merchant Name:</b>", body_style), Paragraph("BoostUp Ghana (boostupgh.com)", body_style),
         Paragraph("<b>Date:</b>", body_style), Paragraph("September 2026", body_style)],
        [Paragraph("<b>APIs Used:</b>", body_style), Paragraph("Online Checkout & RMSC Status API", body_style),
         Paragraph("<b>Integration Type:</b>", body_style), Paragraph("Redirect Checkout + Webhook + Requery", body_style)],
        [Paragraph("<b>Production Domain:</b>", body_style), Paragraph("https://boostupgh.com", body_style),
         Paragraph("<b>Callback Endpoint:</b>", body_style), Paragraph("/api/payments/hubtel/callback", body_style)]
    ]
    t_meta = Table(meta_data, colWidths=[110, 160, 90, 144])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(t_meta)
    elements.append(Spacer(1, 14))

    # Section 1: Executive Overview
    elements.append(Paragraph("1. System Architecture Overview", h1_style))
    elements.append(Paragraph(
        "BoostUp Ghana integrates with Hubtel's <b>Online Checkout API</b> (Redirect flow) and <b>RMSC Merchant Status API</b>. "
        "The architecture is designed around bank-grade security, featuring server-to-server authoritative status re-verification, "
        "distributed Redis locks to eliminate race conditions, and PostgreSQL stored procedure idempotency to prevent double-crediting.",
        body_style
    ))
    elements.append(Spacer(1, 10))

    # Architecture Table
    arch_data = [
        [Paragraph("<b>Layer / Component</b>", body_style), Paragraph("<b>Technology / Implementation</b>", body_style), Paragraph("<b>Function & Responsibilities</b>", body_style)],
        [Paragraph("<b>Frontend Client</b>", body_style), Paragraph("React 18 SPA (boostupgh.com)", body_style), Paragraph("Deposit amount entry, checkout initiation, redirect handling, and polling fallback.", body_style)],
        [Paragraph("<b>Backend API</b>", body_style), Paragraph("Node.js / Next.js Serverless", body_style), Paragraph("PayProxy payload signing, secure UUID client references, webhook receiver.", body_style)],
        [Paragraph("<b>Hubtel Gateway</b>", body_style), Paragraph("PayProxy & RMSC v1 APIs", body_style), Paragraph("Mobile Money (MTN, Telecel, AT) and Card processing; webhook dispatch.", body_style)],
        [Paragraph("<b>Database & Cache</b>", body_style), Paragraph("Supabase PostgreSQL + Redis", body_style), Paragraph("Atomic deposit approval (RPC v2), 30s mutex lock, tamper audit logging.", body_style)],
    ]
    t_arch = Table(arch_data, colWidths=[120, 150, 234])
    t_arch.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0284C7")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor("#FFFFFF")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor("#FFFFFF"), colors.HexColor("#F8FAFC")]),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    elements.append(t_arch)
    elements.append(Spacer(1, 14))

    # Section 2: End-to-End Payment Flow
    elements.append(Paragraph("2. End-to-End API Interaction Flow", h1_style))
    elements.append(Paragraph("The standard deposit transaction follows a 6-stage lifecycle:", body_style))

    flow_steps = [
        ("Step 1: Deposit Initiation (Client -> Merchant API)", "User selects Hubtel on boostupgh.com/dashboard/deposit and specifies amount. Frontend POSTs to /api/payments/hubtel/initiate."),
        ("Step 2: Hubtel Item Initiation (Merchant API -> Hubtel PayProxy)", "Backend generates a cryptographic ClientReference (32 chars) and calls https://payproxyapi.hubtel.com/items/initiate using HTTP Basic Auth (API_ID:API_KEY). Payload includes callbackUrl, returnUrl, cancellationUrl, amount, and clientReference."),
        ("Step 3: Hosted Modal Redirect (Hubtel -> User Browser)", "Hubtel returns responseCode '0000' with checkoutUrl. The user browser is redirected to Hubtel's hosted checkout page."),
        ("Step 4: Payment Authorization (User -> Telco / Hubtel)", "Customer chooses MTN Mobile Money, Telecel Cash, AT Money, or Visa/Mastercard, enters phone/card number, and authorizes the prompt on their phone."),
        ("Step 5: Asynchronous Callback Notification (Hubtel -> Merchant API)", "Hubtel dispatches an HTTP POST webhook to https://boostupgh.com/api/payments/hubtel/callback. Our server locks the transaction in Redis (30s), verifies the payload, and makes an authoritative server-to-server call to Hubtel RMSC Status API."),
        ("Step 6: Atomic Balance Credit (Merchant API -> Database)", "Once verified, approve_deposit_transaction_universal_v2 credits user balance atomically, logs the event, and returns HTTP 200 OK to Hubtel.")
    ]

    for title, desc in flow_steps:
        elements.append(Paragraph(f"<b>{title}</b>", h2_style))
        elements.append(Paragraph(desc, bullet_style))

    elements.append(PageBreak())

    # Section 3: Two-Tier Security Model
    elements.append(Paragraph("3. Security & Anti-Fraud Architecture", h1_style))
    elements.append(Paragraph(
        "To guarantee zero vulnerabilities against spoofing or forged callbacks, BoostUp implements a strict two-tier verification architecture:",
        body_style
    ))
    elements.append(Spacer(1, 6))

    sec_rules = [
        "<b>Rule 1 — Zero-Trust Webhook Ingestion:</b> Incoming callbacks are never used to directly credit user balances. They serve purely as triggers.",
        "<b>Rule 2 — Mandatory RMSC Server-to-Server Verification:</b> Upon callback reception, our backend immediately calls Hubtel's RMSC Status API (https://rmsc.hubtel.com/v1/merchantaccount/merchants/{posId}/transactions/status?clientReference={ref}) using Merchant Basic Auth.",
        "<b>Rule 3 — Strict Amount Matching:</b> We compare Hubtel's verified AmountAfterFees against our database record with a 1% rounding threshold to prevent underpayment exploits.",
        "<b>Rule 4 — Distributed Redis Mutex:</b> A 30-second lock (smm:lock:deposit:{id}) guarantees that simultaneous webhook and status-check events cannot run concurrently.",
        "<b>Rule 5 — PostgreSQL Atomic RPC Idempotency:</b> Transaction status is transitioned atomically; duplicate callbacks return 200 OK without re-crediting."
    ]
    for r in sec_rules:
        elements.append(Paragraph(f"• {r}", bullet_style))

    elements.append(Spacer(1, 14))

    # Section 4: Fallback & Status Check API
    elements.append(Paragraph("4. User Return & Fallback Status Check", h1_style))
    elements.append(Paragraph(
        "If a user completes payment and returns to <code>/payment/success?clientReference=...</code> before the asynchronous webhook is delivered, "
        "the frontend invokes <code>/api/payments/hubtel/status-check</code>. This endpoint queries Hubtel RMSC directly, resolves the payment status, "
        "credits the user wallet if confirmed, and displays the credited balance in real time without requiring user action.",
        body_style
    ))
    elements.append(Spacer(1, 14))

    # Section 5: API Endpoints Table
    elements.append(Paragraph("5. Technical Endpoints Reference", h1_style))
    ep_data = [
        [Paragraph("<b>Endpoint / Purpose</b>", body_style), Paragraph("<b>Method & URL</b>", body_style)],
        [Paragraph("Production Domain", body_style), Paragraph("<code>https://boostupgh.com</code>", body_style)],
        [Paragraph("Deposit Page", body_style), Paragraph("<code>https://boostupgh.com/dashboard/deposit</code>", body_style)],
        [Paragraph("Hubtel Initiate Payment", body_style), Paragraph("<code>POST https://payproxyapi.hubtel.com/items/initiate</code>", body_style)],
        [Paragraph("Merchant Webhook Callback", body_style), Paragraph("<code>POST https://boostupgh.com/api/payments/hubtel/callback</code>", body_style)],
        [Paragraph("Customer Return URL", body_style), Paragraph("<code>GET https://boostupgh.com/payment/success</code>", body_style)],
        [Paragraph("Customer Cancellation URL", body_style), Paragraph("<code>GET https://boostupgh.com/payment/cancelled</code>", body_style)],
        [Paragraph("Hubtel RMSC Status Check", body_style), Paragraph("<code>GET https://rmsc.hubtel.com/v1/merchantaccount/merchants/{posId}/transactions/status</code>", body_style)]
    ]
    t_ep = Table(ep_data, colWidths=[180, 324])
    t_ep.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor("#FFFFFF")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor("#FFFFFF"), colors.HexColor("#F8FAFC")]),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    elements.append(t_ep)

    doc.build(elements, canvasmaker=NumberedCanvas)
    print(f"PDF document created at: {pdf_path}")

if __name__ == "__main__":
    generate_pdf()
