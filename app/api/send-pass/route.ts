import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import MailComposer from "nodemailer/lib/mail-composer";

export async function POST(
    request: NextRequest
) {
    try {
        // ==========================================================
        // READ REQUEST
        // ==========================================================

        const {
            email,
            studentName,
            passId,
            passImageUrl,
        } = await request.json();

        // ==========================================================
        // VALIDATE REQUEST
        // ==========================================================

        if (
            !email ||
            !studentName ||
            !passId ||
            !passImageUrl
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Missing required information.",
                },
                {
                    status: 400,
                }
            );
        }

        // ==========================================================
        // VALIDATE SUPABASE URL
        // ==========================================================

        const supabaseUrl =
            process.env.NEXT_PUBLIC_SUPABASE_URL;

        if (!supabaseUrl) {
            throw new Error(
                "NEXT_PUBLIC_SUPABASE_URL is not configured."
            );
        }

        /*
         * Only allow the pass image to come from
         * our own Supabase project.
         *
         * This prevents arbitrary external URLs
         * from being downloaded by the server.
         */

        let imageUrl: URL;

        try {
            imageUrl =
                new URL(passImageUrl);
        } catch {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Invalid pass image URL.",
                },
                {
                    status: 400,
                }
            );
        }

        const allowedOrigin =
            new URL(
                supabaseUrl
            ).origin;

        if (
            imageUrl.origin !==
            allowedOrigin
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Invalid pass image URL.",
                },
                {
                    status: 400,
                }
            );
        }

        // ==========================================================
        // DOWNLOAD FINAL PNG FROM SUPABASE STORAGE
        // ==========================================================

        const imageResponse =
            await fetch(passImageUrl);

        if (!imageResponse.ok) {
            throw new Error(
                `Could not download pass image. HTTP ${imageResponse.status}`
            );
        }

        const imageArrayBuffer =
            await imageResponse.arrayBuffer();

        const attachmentBuffer =
            Buffer.from(
                imageArrayBuffer
            );

        // ==========================================================
        // GMAIL ENVIRONMENT VARIABLES
        // ==========================================================

        const clientId =
            process.env.GOOGLE_CLIENT_ID;

        const clientSecret =
            process.env.GOOGLE_CLIENT_SECRET;

        const redirectUri =
            process.env.GOOGLE_REDIRECT_URI;

        const refreshToken =
            process.env.GMAIL_REFRESH_TOKEN;

        const senderEmail =
            process.env.GMAIL_SENDER_EMAIL;

        if (
            !clientId ||
            !clientSecret ||
            !redirectUri ||
            !refreshToken ||
            !senderEmail
        ) {
            throw new Error(
                "Gmail environment variables are missing."
            );
        }

        // ==========================================================
        // GOOGLE OAUTH
        // ==========================================================

        const oauth2Client =
            new google.auth.OAuth2(
                clientId,
                clientSecret,
                redirectUri
            );

        oauth2Client.setCredentials({
            refresh_token:
                refreshToken,
        });

        // ==========================================================
        // GMAIL API
        // ==========================================================

        const gmail =
            google.gmail({
                version: "v1",
                auth: oauth2Client,
            });

        // ==========================================================
        // CREATE EMAIL
        // ==========================================================

        const mail =
            new MailComposer({
                from: `"VIBE.EXE 2.0 🎫" <${senderEmail}>`,

                to: email,

                subject: "🎫 Pass Secured. Vibes Loading... | VIBE.EXE 2.0",

                html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VIBE.EXE 2.0</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#0a0a0a;
  font-family:Arial,Helvetica,sans-serif;
  color:#ffffff;
">

<table width="100%" cellpadding="0" cellspacing="0" border="0"
  style="background:#0a0a0a;padding:30px 15px;">

<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0" border="0"
  style="
    max-width:600px;
    width:100%;
    background:#111111;
    border:1px solid #292929;
    border-radius:20px;
    overflow:hidden;
  ">

<!-- HEADER -->

<tr>
<td align="center"
  style="
    padding:38px 25px 30px;
    background:#111111;
  ">

  <div style="
    font-size:13px;
    letter-spacing:4px;
    color:#888888;
    text-transform:uppercase;
    margin-bottom:14px;
  ">
    Department of Computer Science & Engineering
  </div>

  <div style="
    font-size:42px;
    font-weight:900;
    letter-spacing:-1px;
    color:#ffffff;
  ">
    VIBE<span style="color:#666666;">.EXE</span>
  </div>

  <div style="
    font-size:18px;
    color:#888888;
    margin-top:5px;
    letter-spacing:3px;
  ">
    2.0
  </div>

</td>
</tr>


<!-- WELCOME -->

<tr>
<td style="padding:10px 35px 5px;">

  <div style="
    font-size:18px;
    font-weight:bold;
    color:#ffffff;
  ">
    HEY ${studentName} 👋🔥
  </div>

  <div style="
    margin-top:18px;
    padding:14px 16px;
    background:#1b1b1b;
    border:1px solid #303030;
    border-radius:12px;
    font-size:14px;
    color:#dddddd;
  ">
    🚨 <strong>Breaking News:</strong>
    Your attendance actually matters this time. 😂
  </div>

</td>
</tr>


<!-- MAIN WELCOME -->

<tr>
<td style="padding:25px 35px 10px;">

  <div style="
    font-size:30px;
    font-weight:900;
    line-height:1.2;
    color:#ffffff;
  ">
    🚀 WELCOME TO<br>
    VIBE.EXE 2.0
  </div>

  <p style="
    font-size:16px;
    line-height:1.7;
    color:#bbbbbb;
    margin:18px 0 0;
  ">
    <strong style="color:#ffffff;">
      CSE26, the wait is officially over.
    </strong>
  </p>

  <p style="
    font-size:15px;
    line-height:1.7;
    color:#aaaaaa;
    margin:12px 0 0;
  ">
    You're not just attending a freshers event —
    you're stepping into your first big chapter with
    the CSE26 crew. 💻⚡
  </p>

  <p style="
    font-size:15px;
    line-height:1.7;
    color:#aaaaaa;
    margin:12px 0 0;
  ">
    Get ready for music, madness, new faces,
    new friendships and memories that will probably
    make it into the group chat forever. 😭🔥
  </p>

</td>
</tr>


<!-- PASS LOCKED -->

<tr>
<td style="padding:25px 35px;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0"
    style="
      background:#181818;
      border:1px solid #333333;
      border-radius:16px;
    ">

    <tr>
      <td style="padding:22px;">

        <div style="
          font-size:20px;
          font-weight:900;
          color:#ffffff;
          margin-bottom:18px;
        ">
          🎟️ YOUR PASS IS LOCKED IN
        </div>

        <table width="100%" cellpadding="0" cellspacing="0" border="0">

          <tr>
            <td style="padding:7px 0;color:#888888;font-size:13px;">
              EVENT
            </td>
            <td align="right"
              style="padding:7px 0;color:#ffffff;font-size:14px;font-weight:bold;">
              VIBE.EXE 2.0
            </td>
          </tr>

          <tr>
            <td style="padding:7px 0;color:#888888;font-size:13px;">
              DATE
            </td>
            <td align="right"
              style="padding:7px 0;color:#ffffff;font-size:14px;font-weight:bold;">
              04 October 2026
            </td>
          </tr>

          <tr>
            <td style="padding:7px 0;color:#888888;font-size:13px;">
              TIME
            </td>
            <td align="right"
              style="padding:7px 0;color:#ffffff;font-size:14px;font-weight:bold;">
              10:00 AM onwards
            </td>
          </tr>

          <tr>
            <td style="padding:7px 0;color:#888888;font-size:13px;">
              VENUE
            </td>
            <td align="right"
              style="padding:7px 0;color:#ffffff;font-size:14px;font-weight:bold;">
              Balle Balle Restaurant & Banquet
            </td>
          </tr>

        </table>

      </td>
    </tr>

  </table>

</td>
</tr>


<!-- PASS ID -->

<tr>
<td align="center" style="padding:5px 35px 25px;">

  <div style="
    font-size:11px;
    color:#777777;
    letter-spacing:2px;
    text-transform:uppercase;
    margin-bottom:8px;
  ">
    YOUR PASS ID
  </div>

  <div style="
    display:inline-block;
    padding:10px 18px;
    background:#0b0b0b;
    border:1px solid #3a3a3a;
    border-radius:10px;
    color:#ffffff;
    font-size:15px;
    font-weight:bold;
    letter-spacing:2px;
  ">
    ${passId}
  </div>

</td>
</tr>


<!-- ATTACHMENT INFO -->

<tr>
<td style="padding:0 35px 30px;">

  <div style="
    background:#202020;
    border-radius:12px;
    padding:18px;
    text-align:center;
  ">

    <div style="
      font-size:20px;
      margin-bottom:8px;
    ">
      🎫
    </div>

    <div style="
      color:#ffffff;
      font-size:15px;
      font-weight:bold;
    ">
      Your personalized pass is attached
    </div>

    <div style="
      color:#888888;
      font-size:13px;
      margin-top:6px;
      line-height:1.5;
    ">
      Keep it safe and show the QR code
      at the entry desk for verification. 📲
    </div>

  </div>

</td>
</tr>


<!-- FINAL MESSAGE -->

<tr>
<td align="center"
  style="
    padding:10px 35px 35px;
  ">

  <div style="
    font-size:17px;
    font-weight:bold;
    color:#ffffff;
    line-height:1.5;
  ">
    Come dressed to vibe,<br>
    ready to meet your people,<br>
    and make some memories. ✨
  </div>

  <div style="
    margin-top:25px;
    font-size:20px;
    font-weight:900;
    color:#ffffff;
  ">
    🔥 CSE26, LET'S MAKE THIS ONE COUNT.
  </div>

  <div style="
    margin-top:12px;
    font-size:14px;
    color:#888888;
  ">
    See you inside. 👀🚀
  </div>

</td>
</tr>


<!-- FOOTER -->

<tr>
<td align="center"
  style="
    padding:22px;
    border-top:1px solid #292929;
    background:#0d0d0d;
  ">

  <div style="
    font-size:12px;
    color:#666666;
  ">
    — Team VIBE.EXE 2.0
  </div>

</td>
</tr>

</table>

</td>
</tr>

</table>

</body>
</html>
`,

                attachments: [
                    {
                        filename:
                            `${passId}.png`,

                        content:
                            attachmentBuffer,

                        contentType:
                            "image/png",
                    },
                ],
            });

        // ==========================================================
        // BUILD MIME MESSAGE
        // ==========================================================

        const message =
            await mail
                .compile()
                .build();

        // Gmail requires URL-safe base64.
        const encodedMessage =
            message
                .toString("base64")
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");

        // ==========================================================
        // SEND EMAIL
        // ==========================================================

        await gmail.users.messages.send({
            userId: "me",

            requestBody: {
                raw: encodedMessage,
            },
        });

        // ==========================================================
        // SUCCESS
        // ==========================================================

        return NextResponse.json({
            success: true,
            message:
                "Pass sent successfully.",
        });

    } catch (error) {
        console.error(
            "SEND PASS ERROR:",
            error
        );

        return NextResponse.json(
            {
                success: false,

                message:
                    error instanceof Error
                        ? error.message
                        : "Failed to send pass.",
            },
            {
                status: 500,
            }
        );
    }
}