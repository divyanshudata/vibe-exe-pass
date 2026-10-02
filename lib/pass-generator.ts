import { supabase } from "@/lib/supabase";
import QRCode from "qrcode";
import { Bubblegum_Sans } from "next/font/google";

/*
 * Shared, browser-only pass helpers.
 *
 * Used by the single pass form (app/page.tsx)
 * and the bulk JSON sender (app/bulk/page.tsx).
 */

const bubblegum = Bubblegum_Sans({
  weight: "400",
  subsets: ["latin"],
});

// ============================================================
// CREATE FINAL PASS IMAGE
//
// This ONE image is used for:
// 1. Website preview
// 2. Supabase Storage
// 3. Gmail attachment
//
// Design: 1600 x 900
// Export: 3200 x 1800
// ============================================================

export async function createPassImage(
  studentName: string,
  qrDataUrl: string
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const DESIGN_WIDTH = 1600;
      const DESIGN_HEIGHT = 900;

      // 2x final resolution
      const SCALE = 2;

      const canvas = document.createElement("canvas");

      canvas.width = DESIGN_WIDTH * SCALE;
      canvas.height = DESIGN_HEIGHT * SCALE;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(
          new Error("Could not create canvas.")
        );
        return;
      }

      // ======================================================
      // LOAD FONT
      // ======================================================

      await document.fonts.ready;

      try {
        await document.fonts.load(
          `400 52px ${bubblegum.style.fontFamily}`
        );
      } catch {
        // Continue if font loading check fails.
      }

      // ======================================================
      // LOAD PASS TEMPLATE
      // ======================================================

      const background = new Image();

      background.onload = () => {
        try {
          ctx.imageSmoothingEnabled = true;

          ctx.drawImage(
            background,
            0,
            0,
            DESIGN_WIDTH * SCALE,
            DESIGN_HEIGHT * SCALE
          );

          // ==================================================
          // STUDENT NAME
          //
          // SAME POSITION AS ORIGINAL PREVIEW
          //
          // left: 5.5%
          // top: 43.5%
          // width: 47%
          // height: 15%
          // paddingLeft: 2.2%
          // ==================================================

          const nameLeft =
            DESIGN_WIDTH * 0.055;

          const nameTop =
            DESIGN_HEIGHT * 0.435;

          const nameWidth =
            DESIGN_WIDTH * 0.47;

          const nameHeight =
            DESIGN_HEIGHT * 0.15;

          const namePaddingLeft =
            DESIGN_WIDTH * 0.022;

          const fontSize = 52 * SCALE;

          const nameX =
            (nameLeft + namePaddingLeft) *
            SCALE;

          const nameY =
            (nameTop + nameHeight / 2) *
            SCALE;

          const maxNameWidth =
            (nameWidth - namePaddingLeft) *
            SCALE;

          ctx.save();

          ctx.font =
            `800 ${fontSize}px ${bubblegum.style.fontFamily}`;

          ctx.fillStyle = "#111111";

          ctx.textBaseline = "middle";

          // Keep long names inside the original box.
          let displayName = studentName;

          while (
            ctx.measureText(displayName).width >
            maxNameWidth &&
            displayName.length > 3
          ) {
            displayName =
              displayName.slice(0, -1);
          }

          if (
            displayName !== studentName
          ) {
            while (
              ctx.measureText(
                displayName + "..."
              ).width > maxNameWidth &&
              displayName.length > 3
            ) {
              displayName =
                displayName.slice(0, -1);
            }

            displayName += "...";
          }

          ctx.fillText(
            displayName,
            nameX,
            nameY
          );

          ctx.restore();

          // ==================================================
          // QR CODE
          //
          // SAME POSITION AS ORIGINAL PREVIEW
          //
          // left: 64.3%
          // top: 61.8%
          // width: 7%
          // rotate: 21.5deg
          // skewY: -5.6deg
          // ==================================================

          const qrLeft =
            DESIGN_WIDTH * 0.643;

          const qrTop =
            DESIGN_HEIGHT * 0.618;

          const qrSize =
            DESIGN_WIDTH * 0.07;

          const qrSizeHigh =
            qrSize * SCALE;

          const qrX =
            qrLeft * SCALE;

          const qrY =
            qrTop * SCALE;

          const qrImage = new Image();

          qrImage.onload = () => {
            try {
              // Center of QR.
              const centerX =
                qrX + qrSizeHigh / 2;

              const centerY =
                qrY + qrSizeHigh / 2;

              ctx.save();

              // Same transform origin as preview.
              ctx.translate(
                centerX,
                centerY
              );

              // Same CSS rotation.
              ctx.rotate(
                (21.5 * Math.PI) / 180
              );

              // Same CSS skewY.
              const skewY =
                Math.tan(
                  (-5.6 * Math.PI) / 180
                );

              ctx.transform(
                1,
                skewY,
                0,
                1,
                0,
                0
              );

              // Move to QR top-left.
              ctx.translate(
                -qrSizeHigh / 2,
                -qrSizeHigh / 2
              );

              // White QR background.
              ctx.fillStyle = "#ffffff";

              ctx.fillRect(
                0,
                0,
                qrSizeHigh,
                qrSizeHigh
              );

              // Same padding as preview.
              const qrPadding = 6 * SCALE;

              // Keep QR modules sharp.
              ctx.imageSmoothingEnabled =
                false;

              ctx.drawImage(
                qrImage,
                qrPadding,
                qrPadding,
                qrSizeHigh -
                qrPadding * 2,
                qrSizeHigh -
                qrPadding * 2
              );

              ctx.restore();

              // ==================================================
              // FINAL 3200 × 1800 PNG
              // ==================================================

              const finalImage =
                canvas.toDataURL("image/png");

              resolve(finalImage);

            } catch (error) {
              reject(error);
            }
          };

          qrImage.onerror = () => {
            reject(
              new Error(
                "Could not load QR code."
              )
            );
          };

          qrImage.src = qrDataUrl;
        } catch (error) {
          reject(error);
        }
      };

      background.onerror = () => {
        reject(
          new Error(
            "Could not load pass template."
          )
        );
      };

      background.src =
        "/pass-template.png";

    } catch (error) {
      reject(error);
    }
  });
}

// ============================================================
// UPLOAD FINAL PNG TO SUPABASE STORAGE
// ============================================================

export async function uploadPassImage(
  imageDataUrl: string,
  generatedPassId: string
): Promise<string> {
  // Convert base64 data URL to Blob.
  const imageResponse =
    await fetch(imageDataUrl);

  if (!imageResponse.ok) {
    throw new Error(
      "Could not prepare pass image."
    );
  }

  const imageBlob =
    await imageResponse.blob();

  const filePath =
    `passes/${generatedPassId}.png`;

  // Upload to private bucket.
  const { error: uploadError } =
    await supabase.storage
      .from("pass-images")
      .upload(
        filePath,
        imageBlob,
        {
          contentType: "image/png",
          upsert: true,
        }
      );

  if (uploadError) {
    console.error(
      "Storage upload error:",
      uploadError
    );

    throw new Error(
      `Could not upload pass image: ${uploadError.message}`
    );
  }

  // Create temporary signed URL.
  const {
    data: signedUrlData,
    error: signedUrlError,
  } = await supabase.storage
    .from("pass-images")
    .createSignedUrl(
      filePath,
      600
    );

  if (
    signedUrlError ||
    !signedUrlData?.signedUrl
  ) {
    console.error(
      "Signed URL error:",
      signedUrlError
    );

    throw new Error(
      "Could not create pass image URL."
    );
  }

  return signedUrlData.signedUrl;
}


// ============================================================
// ISSUE ONE PASS (used by bulk sender)
//
// Same steps as the single pass form:
// 1. Save pass in Supabase
// 2. Generate QR from unique token
// 3. Create final pass image
// 4. Upload image to Supabase Storage
// 5. Send email via /api/send-pass
// ============================================================

export type PassStudent = {
  name: string;
  rollNumber: string;
  email: string;
};

export type IssuePassResult = {
  passId: string;
  emailSent: boolean;
  emailError?: string;
};

export async function issuePass(
  student: PassStudent,
  onProgress?: (step: string) => void
): Promise<IssuePassResult> {
  const name = student.name.trim();
  const rollNumber = student.rollNumber.trim();
  const email = student.email.trim();

  const generatedPassId =
    "VX26-" +
    Math.random()
      .toString(36)
      .substring(2, 10)
      .toUpperCase();

  const qrToken =
    crypto.randomUUID();

  onProgress?.("Saving pass...");

  const { error } =
    await supabase
      .from("passes")
      .insert({
        pass_id: generatedPassId,
        student_name: name,
        roll_number: rollNumber,
        branch: "CSE",
        batch: "CSE26",
        email: email,
        event_name: "VIBE.EXE 2.0",
        event_date: "2026-10-04",
        event_time: "10:00 AM onwards",
        venue: "Balle Balle Restaurant & Banquet",
        qr_token: qrToken,
        status: "ACTIVE",
      });

  if (error) {
    throw new Error(
      `Failed to generate pass: ${error.message}`
    );
  }

  const qr =
    await QRCode.toDataURL(
      qrToken,
      {
        width: 1200,
        margin: 1,
        errorCorrectionLevel: "H",
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      }
    );

  onProgress?.("Generating pass image...");

  const passImage =
    await createPassImage(name, qr);

  onProgress?.("Uploading pass image...");

  const passImageUrl =
    await uploadPassImage(
      passImage,
      generatedPassId
    );

  onProgress?.("Sending email...");

  const emailResponse =
    await fetch("/api/send-pass", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        studentName: name,
        passId: generatedPassId,
        passImageUrl,
      }),
    });

  const emailResult =
    await emailResponse
      .json()
      .catch(() => ({}));

  if (
    !emailResponse.ok ||
    !emailResult.success
  ) {
    return {
      passId: generatedPassId,
      emailSent: false,
      emailError:
        emailResult.message ||
        `HTTP ${emailResponse.status}`,
    };
  }

  return {
    passId: generatedPassId,
    emailSent: true,
  };
}

// ============================================================
// FIND EXISTING PASSES (to avoid sending twice)
// ============================================================

export async function findExistingPasses(
  emails: string[]
): Promise<Map<string, string>> {
  const existing = new Map<string, string>();
  const CHUNK = 100;

  for (let i = 0; i < emails.length; i += CHUNK) {
    const { data, error } =
      await supabase
        .from("passes")
        .select("email, pass_id")
        .in("email", emails.slice(i, i + CHUNK));

    if (error) {
      throw new Error(
        `Could not check existing passes: ${error.message}`
      );
    }

    for (const row of data ?? []) {
      existing.set(
        String(row.email).toLowerCase(),
        row.pass_id
      );
    }
  }

  return existing;
}
