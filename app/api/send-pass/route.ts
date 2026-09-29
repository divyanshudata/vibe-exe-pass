import { NextResponse } from "next/server";
import { google } from "googleapis";
import MailComposer from "nodemailer/lib/mail-composer";

export async function POST(request: Request) {
    try {
        const {
            email,
            studentName,
            passId,
            passImage,
        } = await request.json();

        // -----------------------------
        // Validate request
        // -----------------------------

        if (!email || !studentName || !passId || !passImage) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Missing email, student name, pass ID, or pass image.",
                },
                { status: 400 }
            );
        }

        // -----------------------------
        // Environment variables
        // -----------------------------

        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
        const senderEmail = process.env.GMAIL_SENDER_EMAIL;

        if (
            !clientId ||
            !clientSecret ||
            !refreshToken ||
            !senderEmail
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Gmail environment variables are missing.",
                },
                { status: 500 }
            );
        }

        // -----------------------------
        // Extract PNG from data URL
        // -----------------------------

        const base64Data = passImage.split(",")[1];

        if (!base64Data) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Invalid pass image.",
                },
                { status: 400 }
            );
        }

        const attachmentBuffer = Buffer.from(
            base64Data,
            "base64"
        );

        // -----------------------------
        // Create OAuth client
        // -----------------------------

        const oauth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            refresh_token: refreshToken,
        });

        // -----------------------------
        // Create Gmail API client
        // -----------------------------

        const gmail = google.gmail({
            version: "v1",
            auth: oauth2Client,
        });

        // -----------------------------
        // Build MIME email
        // -----------------------------

        const mail = new MailComposer({
            from: `VIBE.EXE 2.0 <${senderEmail}>`,
            to: email,
            subject: "Your VIBE.EXE 2.0 Event Pass",

            text: `
Hello ${studentName},

Your VIBE.EXE 2.0 pass has been generated successfully.

Pass ID: ${passId}

Event:
VIBE.EXE 2.0
04 OCT 2026
10:00 AM onwards
Balle Balle Restaurant & Banquet

Please find your pass attached to this email.

Please keep this pass safe and present it at the event.

Regards,
VIBE.EXE 2.0 Team
      `.trim(),

            html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>🎟️ VIBE.EXE 2.0 Pass</h2>

          <p>Hello <strong>${studentName}</strong>,</p>

          <p>
            Your VIBE.EXE 2.0 pass has been generated successfully.
          </p>

          <p>
            <strong>Pass ID:</strong> ${passId}
          </p>

          <p>
            <strong>Event:</strong> VIBE.EXE 2.0<br>
            <strong>Date:</strong> 04 OCT 2026<br>
            <strong>Time:</strong> 10:00 AM onwards<br>
            <strong>Venue:</strong> Balle Balle Restaurant & Banquet
          </p>

          <p>
            Your official pass is attached to this email.
          </p>

          <p>
            Please keep the pass safe and present it at the event.
          </p>

          <p>
            Regards,<br>
            <strong>VIBE.EXE 2.0 Team</strong>
          </p>
        </div>
      `,

            attachments: [
                {
                    filename: `VIBE-EXE-2.0-${passId}.png`,
                    content: attachmentBuffer,
                    contentType: "image/png",
                },
            ],
        });

        // -----------------------------
        // Convert MIME message to buffer
        // -----------------------------

        const messageBuffer = await new Promise<Buffer>(
            (resolve, reject) => {
                mail.compile().build((error, message) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(message);
                    }
                });
            }
        );

        // -----------------------------
        // Gmail requires base64url
        // -----------------------------

        const rawMessage = messageBuffer
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

        // -----------------------------
        // Send through Gmail API
        // -----------------------------

        const result = await gmail.users.messages.send({
            userId: "me",
            requestBody: {
                raw: rawMessage,
            },
        });

        console.log(
            "Gmail message sent:",
            result.data.id
        );

        return NextResponse.json({
            success: true,
            message: "Pass email sent successfully.",
            id: result.data.id,
        });

    } catch (error: any) {
        console.error(
            "========== GMAIL SEND ERROR =========="
        );

        console.error(error);

        console.error(
            "======================================="
        );

        return NextResponse.json(
            {
                success: false,
                message:
                    error?.response?.data?.error?.message ||
                    error?.message ||
                    "Failed to send email through Gmail.",
            },
            { status: 500 }
        );
    }
}