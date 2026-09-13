import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

def create_presentation():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_slide_layout = prs.slide_layouts[6]

    NAVY = RGBColor(15, 23, 42)        # #0F172A
    CARD_BG = RGBColor(30, 41, 59)     # #1E293B
    TEXT_WHITE = RGBColor(248, 250, 252)
    TEXT_MUTED = RGBColor(148, 163, 184)
    ACCENT_CYAN = RGBColor(14, 165, 233) # Hubtel cyan
    ACCENT_GREEN = RGBColor(34, 197, 94)
    ACCENT_AMBER = RGBColor(245, 158, 11)
    CARD_BORDER = RGBColor(51, 65, 85)

    def set_background(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = NAVY
        bg.line.fill.background()
        return bg

    def add_header(slide, title, category="HUBTEL UAT INTEGRATION FLOW"):
        cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.7), Inches(0.4))
        tf_c = cat_box.text_frame
        tf_c.word_wrap = True
        p_c = tf_c.paragraphs[0]
        p_c.text = category.upper()
        p_c.font.size = Pt(11)
        p_c.font.bold = True
        p_c.font.color.rgb = ACCENT_CYAN

        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.7), Inches(11.7), Inches(0.8))
        tf_t = title_box.text_frame
        tf_t.word_wrap = True
        p_t = tf_t.paragraphs[0]
        p_t.text = title
        p_t.font.size = Pt(24)
        p_t.font.bold = True
        p_t.font.color.rgb = TEXT_WHITE

    # ── SLIDE 1: Title Slide ──
    s1 = prs.slides.add_slide(blank_slide_layout)
    set_background(s1)

    bar = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(2.2), Inches(0.15), Inches(3.2))
    bar.fill.solid()
    bar.fill.fore_color.rgb = ACCENT_CYAN
    bar.line.fill.background()

    tb = s1.shapes.add_textbox(Inches(1.2), Inches(2.1), Inches(11), Inches(3.5))
    tf = tb.text_frame
    p0 = tf.paragraphs[0]
    p0.text = "HUBTEL PAYMENT INTEGRATION"
    p0.font.size = Pt(14)
    p0.font.bold = True
    p0.font.color.rgb = ACCENT_CYAN

    p1 = tf.add_paragraph()
    p1.text = "System Architecture & API Interface Flow"
    p1.font.size = Pt(36)
    p1.font.bold = True
    p1.font.color.rgb = TEXT_WHITE
    p1.space_before = Pt(10)

    p2 = tf.add_paragraph()
    p2.text = "Production UAT Submission & End-to-End Verification Document"
    p2.font.size = Pt(18)
    p2.font.color.rgb = TEXT_MUTED
    p2.space_before = Pt(8)

    p3 = tf.add_paragraph()
    p3.text = "Merchant App: BoostUp Ghana (boostupgh.com)  |  APIs: Online Checkout & RMSC Status API"
    p3.font.size = Pt(13)
    p3.font.color.rgb = ACCENT_GREEN
    p3.space_before = Pt(24)

    # ── SLIDE 2: High Level Architecture ──
    s2 = prs.slides.add_slide(blank_slide_layout)
    set_background(s2)
    add_header(s2, "System Architecture & Integration Topology")

    components = [
        ("1. User Client (Browser)", "React 18 SPA at boostupgh.com\n\n• User selects deposit amount\n• Initiates payment request\n• Redirects to Hubtel Checkout\n• Displays real-time confirmation", ACCENT_CYAN),
        ("2. Backend Application", "Next.js / Node.js Serverless API\n\n• Generates secure ClientReference\n• Authenticates with Hubtel PayProxy\n• Asynchronous webhook receiver\n• Re-verifies every transaction", ACCENT_AMBER),
        ("3. Hubtel Gateway", "Hubtel Online Checkout & RMSC\n\n• Hosted payment modal\n• MTN, Telecel, AT & Cards\n• Dispatches instant webhooks\n• Authoritative RMSC Status API", ACCENT_GREEN),
        ("4. Storage & Security", "Supabase DB & Redis Locks\n\n• Atomic double-credit prevention\n• Distributed Redis lock (30s)\n• Idempotent v2 stored procedure\n• Comprehensive audit logging", ACCENT_CYAN)
    ]

    for i, (title, desc, col) in enumerate(components):
        left = Inches(0.8 + i * 2.95)
        top = Inches(1.8)
        width = Inches(2.8)
        height = Inches(4.8)

        card = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER

        tb = s2.shapes.add_textbox(left + Inches(0.15), top + Inches(0.2), width - Inches(0.3), height - Inches(0.4))
        tf = tb.text_frame
        tf.word_wrap = True

        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(15)
        p.font.bold = True
        p.font.color.rgb = col

        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.size = Pt(12)
        p2.font.color.rgb = TEXT_WHITE
        p2.space_before = Pt(12)

    # ── SLIDE 3: End-to-End Payment Flow ──
    s3 = prs.slides.add_slide(blank_slide_layout)
    set_background(s3)
    add_header(s3, "End-to-End Deposit Flow (Step-by-Step)")

    steps = [
        ("Step 1: Deposit Request", "User enters amount (e.g. ₵50) on BoostUp Deposit page and clicks 'Pay with Hubtel'.", "User -> BoostUp App"),
        ("Step 2: Server Initiation", "Backend generates unique ClientReference (32-char UUID) and calls Hubtel /items/initiate with Basic Auth.", "BoostUp API -> Hubtel PayProxy"),
        ("Step 3: Hubtel Redirect", "Hubtel responds with 0000 code and checkoutUrl. User browser redirects to Hubtel secure checkout modal.", "Hubtel -> User Browser"),
        ("Step 4: Customer Payment", "Customer selects Mobile Money (MTN / Telecel / AT) or Card and authorizes prompt on mobile phone.", "Customer -> Telco / Bank"),
        ("Step 5: Webhook & Verification", "Hubtel dispatches callback to /api/payments/hubtel/callback. Our server immediately re-queries Hubtel RMSC.", "Hubtel Webhook -> BoostUp API"),
        ("Step 6: Wallet Balance Credited", "Database atomically updates transaction status to 'Paid' and increments user wallet balance.", "PostgreSQL Atomic Function")
    ]

    for i, (stitle, sdesc, stags) in enumerate(steps):
        row = i // 2
        col = i % 2
        left = Inches(0.8 + col * 5.95)
        top = Inches(1.8 + row * 1.65)
        width = Inches(5.8)
        height = Inches(1.45)

        card = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER

        tb = s3.shapes.add_textbox(left + Inches(0.2), top + Inches(0.15), width - Inches(0.4), height - Inches(0.3))
        tf = tb.text_frame
        tf.word_wrap = True

        p = tf.paragraphs[0]
        p.text = f"{stitle}  ({stags})"
        p.font.size = Pt(13)
        p.font.bold = True
        p.font.color.rgb = ACCENT_CYAN

        p2 = tf.add_paragraph()
        p2.text = sdesc
        p2.font.size = Pt(12)
        p2.font.color.rgb = TEXT_WHITE
        p2.space_before = Pt(4)

    # ── SLIDE 4: Webhook & Two-Tier Security Model ──
    s4 = prs.slides.add_slide(blank_slide_layout)
    set_background(s4)
    add_header(s4, "Two-Tier Security & Server-to-Server Verification")

    sec_cards = [
        ("Tier 1: Webhook Ingestion (/callback)", 
         "• Listens for POST callbacks from Hubtel\n• Extracts ClientReference, TransactionId, and Amount\n• Checks transaction status idempotency in DB\n• Acquires distributed Redis Lock (30s) to prevent concurrent execution races", 
         ACCENT_CYAN),
        ("Tier 2: Server-to-Server RMSC Verification", 
         "• MANDATORY: Never trust incoming callback body alone\n• Server makes an HTTPS GET call to official Hubtel RMSC API:\n  https://rmsc.hubtel.com/v1/merchantaccount/merchants/{posId}/transactions/status\n• Authenticates with Merchant Basic Auth credentials\n• Authoritatively verifies TransactionStatus == 'Success' | 'Paid'", 
         ACCENT_GREEN),
        ("Tier 3: Strict Amount & Fraud Defense", 
         "• Verifies AmountAfterFees matches requested deposit amount (with 1% fee tolerance)\n• Checks user ban / suspension status in banned_users table\n• Invokes PostgreSQL RPC approve_deposit_transaction_universal_v2\n• Logs security events and user activity audit trail", 
         ACCENT_AMBER)
    ]

    for i, (title, desc, col) in enumerate(sec_cards):
        left = Inches(0.8 + i * 3.95)
        top = Inches(1.8)
        width = Inches(3.8)
        height = Inches(4.8)

        card = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER

        tb = s4.shapes.add_textbox(left + Inches(0.2), top + Inches(0.2), width - Inches(0.4), height - Inches(0.4))
        tf = tb.text_frame
        tf.word_wrap = True

        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(14)
        p.font.bold = True
        p.font.color.rgb = col

        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.size = Pt(12)
        p2.font.color.rgb = TEXT_WHITE
        p2.space_before = Pt(12)

    # ── SLIDE 5: Fallback & Status Check API Flow ──
    s5 = prs.slides.add_slide(blank_slide_layout)
    set_background(s5)
    add_header(s5, "Status Check / Polling & Fallback Mechanism")

    tb5 = s5.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(11.7), Inches(4.8))
    tf5 = tb5.text_frame
    tf5.word_wrap = True

    p = tf5.paragraphs[0]
    p.text = "Authoritative Status Check Endpoint (/api/payments/hubtel/status-check)"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = ACCENT_CYAN

    points = [
        ("1. User Return Redirection: ", "When user returns to /payment/success?clientReference=..., the frontend immediately requests /api/payments/hubtel/status-check."),
        ("2. Missed / Delayed Webhooks: ", "If network latency or telco delay stalls the webhook callback, the status-check endpoint acts as an active fallback resolver."),
        ("3. Direct Hubtel RMSC Verification: ", "Contacts Hubtel RMSC Status endpoint using merchant credentials. If payment is confirmed, credits wallet immediately."),
        ("4. Re-entrancy & Race Protection: ", "Protected by the same Redis lock and PostgreSQL atomic transaction logic so duplicate requests can never result in double crediting.")
    ]

    for p_title, p_body in points:
        para = tf5.add_paragraph()
        para.space_before = Pt(14)
        run1 = para.add_run()
        run1.text = p_title
        run1.font.size = Pt(14)
        run1.font.bold = True
        run1.font.color.rgb = ACCENT_GREEN
        run2 = para.add_run()
        run2.text = p_body
        run2.font.size = Pt(13)
        run2.font.color.rgb = TEXT_WHITE

    # ── SLIDE 6: Production Endpoints & Parameters ──
    s6 = prs.slides.add_slide(blank_slide_layout)
    set_background(s6)
    add_header(s6, "Production Endpoints & Technical Summary")

    endpoints = [
        ("Main Application URL", "https://boostupgh.com"),
        ("Deposit Initiation URL", "https://boostupgh.com/dashboard/deposit"),
        ("Hubtel Initiation API", "https://payproxyapi.hubtel.com/items/initiate"),
        ("Merchant Callback URL (Webhook)", "https://boostupgh.com/api/payments/hubtel/callback"),
        ("Return URL (Customer Redirect)", "https://boostupgh.com/payment/success"),
        ("Cancellation URL", "https://boostupgh.com/payment/cancelled"),
        ("Hubtel RMSC Status API", "https://rmsc.hubtel.com/v1/merchantaccount/merchants/{posId}/transactions/status")
    ]

    for i, (label, url) in enumerate(endpoints):
        top = Inches(1.8 + i * 0.7)
        card = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), top, Inches(11.7), Inches(0.6))
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER

        tb = s6.shapes.add_textbox(Inches(1.0), top + Inches(0.08), Inches(11.3), Inches(0.44))
        tf = tb.text_frame
        p = tf.paragraphs[0]
        r1 = p.add_run()
        r1.text = f"{label}: "
        r1.font.size = Pt(13)
        r1.font.bold = True
        r1.font.color.rgb = ACCENT_CYAN

        r2 = p.add_run()
        r2.text = url
        r2.font.size = Pt(13)
        r2.font.color.rgb = TEXT_WHITE

    output_path = r"c:\Users\DELL\Desktop\ephraim\myfolder\app\Hubtel_Integration_Architecture_and_Flow.pptx"
    prs.save(output_path)
    print(f"PowerPoint presentation created at: {output_path}")

if __name__ == "__main__":
    create_presentation()
