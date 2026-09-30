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
                from: senderEmail,

                to: email,

                subject:
                    "Your VIBE.EXE 2.0 Event Pass",

                text: `Hello ${studentName},

Your VIBE.EXE 2.0 event pass is attached to this email.

Pass ID: ${passId}

Event: VIBE.EXE 2.0
Date: 04 October 2026
Time: 10:00 AM onwards
Venue: Balle Balle Restaurant & Banquet

Please keep this pass with you for entry.

Regards,
VIBE.EXE 2.0 Team`,

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