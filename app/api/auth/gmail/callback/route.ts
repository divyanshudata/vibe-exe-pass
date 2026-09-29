import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        const code = searchParams.get("code");
        const oauthError = searchParams.get("error");

        if (oauthError) {
            return NextResponse.json(
                {
                    success: false,
                    stage: "google_authorization",
                    error: oauthError,
                },
                { status: 400 }
            );
        }

        if (!code) {
            return NextResponse.json(
                {
                    success: false,
                    stage: "callback",
                    error: "Authorization code missing.",
                },
                { status: 400 }
            );
        }

        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const redirectUri = process.env.GOOGLE_REDIRECT_URI;

        if (!clientId || !clientSecret || !redirectUri) {
            return NextResponse.json(
                {
                    success: false,
                    stage: "environment",
                    hasClientId: !!clientId,
                    hasClientSecret: !!clientSecret,
                    redirectUri: redirectUri || null,
                },
                { status: 500 }
            );
        }

        const oauth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret,
            redirectUri
        );

        const { tokens } = await oauth2Client.getToken(code);

        if (!tokens.refresh_token) {
            return NextResponse.json(
                {
                    success: false,
                    stage: "token_exchange",
                    message:
                        "Authorization succeeded, but Google did not return a refresh token.",
                },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Gmail authorization successful.",
            refreshToken: tokens.refresh_token,
        });
    } catch (error: any) {
        console.error("========== GMAIL OAUTH ERROR ==========");
        console.error(error?.message);
        console.error(error?.response?.data);
        console.error("========================================");

        return NextResponse.json(
            {
                success: false,
                stage: "token_exchange",
                message: error?.message || "Unknown error",
                googleError: error?.response?.data?.error || null,
                googleErrorDescription:
                    error?.response?.data?.error_description || null,
            },
            { status: 500 }
        );
    }
}