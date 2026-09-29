"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { Bubblegum_Sans } from "next/font/google";

const bubblegum = Bubblegum_Sans({
  weight: "400",
  subsets: ["latin"],
});

export default function Home() {
  const [name, setName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [branch, setBranch] = useState("");
  const [batch, setBatch] = useState("");
  const [email, setEmail] = useState("");

  const [qrCode, setQrCode] = useState("");
  const [passId, setPassId] = useState("");
  const [generatedName, setGeneratedName] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  /*
   * ============================================================
   * CREATE HIGH-RESOLUTION PASS IMAGE
   * ============================================================
   *
   * Preview design:
   * 1600 × 900
   *
   * Email image:
   * 3200 × 1800
   *
   * The visual design remains based on the 1600 × 900
   * coordinate system.
   */

  async function createPassImage(
    studentName: string,
    qrDataUrl: string
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        const DESIGN_WIDTH = 1600;
        const DESIGN_HEIGHT = 900;

        /*
         * 2× resolution for the final PNG.
         */
        const SCALE = 2;

        const canvas = document.createElement("canvas");

        canvas.width =
          DESIGN_WIDTH * SCALE;

        canvas.height =
          DESIGN_HEIGHT * SCALE;

        const ctx =
          canvas.getContext("2d");

        if (!ctx) {
          reject(
            new Error(
              "Could not create canvas."
            )
          );

          return;
        }

        /*
         * ========================================================
         * LOAD FONT
         * ========================================================
         */

        await document.fonts.ready;

        try {
          await document.fonts.load(
            `400 52px ${bubblegum.style.fontFamily}`
          );
        } catch {
          // Continue if font loading check fails.
        }

        /*
         * ========================================================
         * LOAD PASS TEMPLATE
         * ========================================================
         */

        const background =
          new Image();

        background.onload = () => {
          /*
           * Draw background at high resolution.
           */

          ctx.imageSmoothingEnabled = true;

          ctx.drawImage(
            background,
            0,
            0,
            DESIGN_WIDTH * SCALE,
            DESIGN_HEIGHT * SCALE
          );

          /*
           * ======================================================
           * STUDENT NAME
           * ======================================================
           *
           * Same preview:
           *
           * left: 5.5%
           * top: 43.5%
           * width: 47%
           * height: 15%
           * paddingLeft: 2.2%
           * Bubblegum Sans
           */

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

          /*
           * 52px design font × 2.
           */

          const fontSize =
            52 * SCALE;

          const nameX =
            (nameLeft +
              namePaddingLeft) *
            SCALE;

          const nameY =
            (nameTop +
              nameHeight / 2) *
            SCALE;

          const maxNameWidth =
            (nameWidth -
              namePaddingLeft) *
            SCALE;

          ctx.save();

          ctx.font =
            `400 ${fontSize}px ${bubblegum.style.fontFamily}`;

          ctx.fillStyle =
            "#111111";

          ctx.textBaseline =
            "middle";

          /*
           * Prevent very long names from
           * overflowing the name box.
           */

          let displayName =
            studentName;

          while (
            ctx.measureText(
              displayName
            ).width >
            maxNameWidth &&
            displayName.length > 3
          ) {
            displayName =
              displayName.slice(
                0,
                -1
              );
          }

          if (
            displayName !==
            studentName
          ) {
            while (
              ctx.measureText(
                displayName + "..."
              ).width >
              maxNameWidth &&
              displayName.length > 3
            ) {
              displayName =
                displayName.slice(
                  0,
                  -1
                );
            }

            displayName += "...";
          }

          ctx.fillText(
            displayName,
            nameX,
            nameY
          );

          ctx.restore();

          /*
           * ======================================================
           * QR CODE
           * ======================================================
           *
           * Preview:
           *
           * left: 64.3%
           * top: 61.8%
           * width: 7%
           *
           * rotate(21.5deg)
           * skewY(-5.6deg)
           */

          const qrContainerX =
            DESIGN_WIDTH * 0.643;

          const qrContainerY =
            DESIGN_HEIGHT * 0.618;

          const qrContainerSize =
            DESIGN_WIDTH * 0.07;

          /*
           * 112px design size × 2.
           */

          const qrSize =
            qrContainerSize;

          const qrSizeHigh =
            qrSize * SCALE;

          const qrX =
            qrContainerX * SCALE;

          const qrY =
            qrContainerY * SCALE;

          const qrImage =
            new Image();

          qrImage.onload = () => {
            /*
             * Center of QR.
             */

            const centerX =
              qrX +
              qrSizeHigh / 2;

            const centerY =
              qrY +
              qrSizeHigh / 2;

            ctx.save();

            /*
             * Move to QR center.
             */

            ctx.translate(
              centerX,
              centerY
            );

            /*
             * EXACT PREVIEW ROTATION
             */

            ctx.rotate(
              (21.5 * Math.PI) /
              180
            );

            /*
             * EXACT PREVIEW SKEW
             */

            const skewY =
              Math.tan(
                (-5.6 * Math.PI) /
                180
              );

            ctx.transform(
              1,
              skewY,
              0,
              1,
              0,
              0
            );

            /*
             * Move back to QR top-left.
             */

            ctx.translate(
              -qrSizeHigh / 2,
              -qrSizeHigh / 2
            );

            /*
             * ====================================================
             * WHITE QR BACKGROUND
             * ====================================================
             */

            ctx.imageSmoothingEnabled =
              false;

            ctx.fillStyle =
              "#ffffff";

            ctx.fillRect(
              0,
              0,
              qrSizeHigh,
              qrSizeHigh
            );

            /*
             * ====================================================
             * QR PADDING
             * ====================================================
             */

            const qrPadding =
              6 * SCALE;

            /*
             * ====================================================
             * DRAW QR
             * ====================================================
             *
             * No smoothing is used for the QR itself.
             * This keeps the black/white modules sharp.
             */

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

            /*
             * ====================================================
             * FINAL PNG
             * ====================================================
             *
             * 3200 × 1800
             */

            const finalImage =
              canvas.toDataURL(
                "image/png"
              );

            resolve(
              finalImage
            );
          };

          qrImage.onerror = () => {
            reject(
              new Error(
                "Could not load QR code."
              )
            );
          };

          qrImage.src =
            qrDataUrl;
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

  /*
   * ============================================================
   * GENERATE PASS
   * ============================================================
   */

  async function generatePass() {
    /*
     * Validate fields.
     */

    if (
      !name.trim() ||
      !rollNumber.trim() ||
      !branch.trim() ||
      !batch.trim() ||
      !email.trim()
    ) {
      setMessage(
        "Please fill all fields, including Email ID."
      );

      return;
    }

    setLoading(true);
    setMessage("");
    setQrCode("");
    setPassId("");

    try {
      /*
       * ========================================================
       * UNIQUE PASS ID
       * ========================================================
       */

      const generatedPassId =
        "VX26-" +
        Math.random()
          .toString(36)
          .substring(2, 10)
          .toUpperCase();

      /*
       * ========================================================
       * UNIQUE QR TOKEN
       * ========================================================
       */

      const qrToken =
        crypto.randomUUID();

      /*
       * ========================================================
       * SAVE PASS IN SUPABASE
       * ========================================================
       */

      const { error } =
        await supabase
          .from("passes")
          .insert({
            pass_id:
              generatedPassId,

            student_name:
              name.trim(),

            roll_number:
              rollNumber.trim(),

            branch:
              branch.trim(),

            batch:
              batch.trim(),

            email:
              email.trim(),

            event_name:
              "VIBE.EXE 2.0",

            event_date:
              "2026-10-04",

            event_time:
              "10:00 AM onwards",

            venue:
              "Balle Balle Restaurant & Banquet",

            qr_token:
              qrToken,

            status:
              "ACTIVE",
          });

      if (error) {
        console.error(
          "Supabase error:",
          error
        );

        setMessage(
          `Failed to generate pass: ${error.message}`
        );

        return;
      }

      /*
       * ========================================================
       * GENERATE HIGH-RES QR
       * ========================================================
       *
       * 1200 × 1200 source QR.
       */

      const qr =
        await QRCode.toDataURL(
          qrToken,
          {
            width: 1200,

            /*
             * Keep the QR source crisp.
             */
            margin: 1,

            /*
             * Highest error correction.
             */
            errorCorrectionLevel:
              "H",

            color: {
              dark: "#000000",
              light: "#FFFFFF",
            },
          }
        );

      /*
       * ========================================================
       * SHOW PASS PREVIEW
       * ========================================================
       */

      setQrCode(qr);

      setPassId(
        generatedPassId
      );

      setGeneratedName(
        name.trim()
      );

      /*
       * ========================================================
       * CREATE EMAIL IMAGE
       * ========================================================
       */

      setMessage(
        "Generating high-resolution pass..."
      );

      const passImage =
        await createPassImage(
          name.trim(),
          qr
        );

      /*
       * ========================================================
       * SEND EMAIL
       * ========================================================
       */

      setMessage(
        "Sending pass to email..."
      );

      const emailResponse =
        await fetch(
          "/api/send-pass",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              email:
                email.trim(),

              studentName:
                name.trim(),

              passId:
                generatedPassId,

              passImage:
                passImage,
            }),
          }
        );

      const emailResult =
        await emailResponse.json();

      /*
       * ========================================================
       * EMAIL ERROR
       * ========================================================
       */

      if (
        !emailResponse.ok ||
        !emailResult.success
      ) {
        console.error(
          "Email error:",
          emailResult
        );

        setMessage(
          `Pass generated, but email could not be sent: ${emailResult.message ||
          "Unknown error"
          }`
        );

        return;
      }

      /*
       * ========================================================
       * SUCCESS
       * ========================================================
       */

      setMessage(
        `✅ Pass generated and sent to ${email.trim()}`
      );

      /*
       * Clear form.
       */

      setName("");
      setRollNumber("");
      setBranch("");
      setBatch("");
      setEmail("");

    } catch (error) {
      console.error(
        "Generate pass error:",
        error
      );

      setMessage(
        "Something went wrong."
      );

    } finally {
      setLoading(false);
    }
  }

  /*
   * ============================================================
   * UI
   * ============================================================
   */

  return (
    <main className="min-h-screen bg-black text-white px-4 py-10">

      <div className="max-w-6xl mx-auto">

        {/* ======================================================
            HEADER
            ====================================================== */}

        <div className="text-center mb-10">

          <p className="text-xs md:text-sm tracking-[0.3em] text-gray-400 uppercase">
            Department of Computer Science & Engineering
          </p>

          <h1 className="text-5xl md:text-6xl font-black mt-4">
            VIBE.EXE{" "}
            <span className="text-gray-500">
              2.0
            </span>
          </h1>

          <p className="text-gray-500 mt-3">
            Freshers Pass Management System
          </p>

        </div>

        {/* ======================================================
            GENERATE FORM
            ====================================================== */}

        <div className="max-w-xl mx-auto bg-zinc-950 border border-zinc-800 rounded-2xl p-7">

          <h2 className="text-2xl font-bold">
            Generate Pass
          </h2>

          <p className="text-sm text-gray-500 mt-2 mb-7">
            Generate a personalized pass with a unique QR code.
          </p>

          <div className="space-y-5">

            {/* STUDENT NAME */}

            <div>

              <label className="block text-sm text-gray-400 mb-2">
                Student Name
              </label>

              <input
                type="text"
                value={name}
                onChange={(e) =>
                  setName(
                    e.target.value
                  )
                }
                placeholder="Enter student name"
                className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 outline-none focus:border-white"
              />

            </div>

            {/* ROLL NUMBER */}

            <div>

              <label className="block text-sm text-gray-400 mb-2">
                Roll Number
              </label>

              <input
                type="text"
                value={rollNumber}
                onChange={(e) =>
                  setRollNumber(
                    e.target.value
                  )
                }
                placeholder="Enter roll number"
                className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 outline-none focus:border-white"
              />

            </div>

            {/* BRANCH */}

            <div>

              <label className="block text-sm text-gray-400 mb-2">
                Branch
              </label>

              <input
                type="text"
                value={branch}
                onChange={(e) =>
                  setBranch(
                    e.target.value
                  )
                }
                placeholder="Computer Science & Engineering"
                className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 outline-none focus:border-white"
              />

            </div>

            {/* BATCH */}

            <div>

              <label className="block text-sm text-gray-400 mb-2">
                Batch
              </label>

              <input
                type="text"
                value={batch}
                onChange={(e) =>
                  setBatch(
                    e.target.value
                  )
                }
                placeholder="CSE 26"
                className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 outline-none focus:border-white"
              />

            </div>

            {/* EMAIL */}

            <div>

              <label className="block text-sm text-gray-400 mb-2">
                Email ID
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) =>
                  setEmail(
                    e.target.value
                  )
                }
                placeholder="student@example.com"
                className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 outline-none focus:border-white"
              />

            </div>

            {/* BUTTON */}

            <button
              onClick={
                generatePass
              }
              disabled={loading}
              className="w-full bg-white text-black font-bold py-3.5 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
            >
              {loading
                ? "GENERATING & SENDING..."
                : "GENERATE & SEND PASS"}
            </button>

          </div>

          {/* ====================================================
              MESSAGE
              ==================================================== */}

          {message && (
            <div className="mt-5 bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm">
              {message}
            </div>
          )}

        </div>

        {/* ======================================================
            GENERATED PASS
            ====================================================== */}

        {qrCode && passId && (

          <div className="mt-12">

            <div className="mb-5">

              <h2 className="text-2xl font-bold">
                Generated Pass
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                {passId}
              </p>

            </div>

            {/* ==================================================
                RESPONSIVE PREVIEW
                ================================================== */}

            <div className="w-full bg-zinc-900 p-3 md:p-4 rounded-2xl overflow-hidden">

              <div className="w-full flex justify-center">

                <div
                  className="relative w-full"
                  style={{
                    aspectRatio:
                      "1600 / 900",

                    maxWidth:
                      "1100px",
                  }}
                >

                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage:
                        "url('/pass-template.png')",

                      backgroundSize:
                        "100% 100%",

                      backgroundRepeat:
                        "no-repeat",
                    }}
                  >

                    {/* ========================================
                        STUDENT NAME
                        ======================================== */}

                    <div
                      className="absolute flex items-center"
                      style={{
                        left: "5.5%",
                        top: "43.5%",
                        width: "47%",
                        height: "15%",

                        paddingLeft:
                          "2.2%",

                        paddingRight:
                          "1%",

                        fontSize:
                          "clamp(20px, 3.2vw, 52px)",

                        fontWeight: 800,

                        color:
                          "#111111",

                        fontFamily:
                          bubblegum.style
                            .fontFamily,

                        whiteSpace:
                          "nowrap",

                        overflow:
                          "hidden",

                        textOverflow:
                          "ellipsis",
                      }}
                    >
                      {generatedName}
                    </div>

                    {/* ========================================
                        UNIQUE QR CODE
                        ======================================== */}

                    <div
                      className="absolute flex items-center justify-center"
                      style={{
                        left: "64.3%",
                        top: "61.8%",
                        width: "7%",

                        aspectRatio:
                          "1 / 1",

                        transform:
                          "rotate(21.5deg) skewY(-5.6deg)",

                        transformOrigin:
                          "center",
                      }}
                    >

                      <div
                        style={{
                          width:
                            "min(145px, 100%)",

                          aspectRatio:
                            "1 / 1",

                          backgroundColor:
                            "#ffffff",

                          padding:
                            "6px",

                          display:
                            "flex",

                          alignItems:
                            "center",

                          justifyContent:
                            "center",

                          boxSizing:
                            "border-box",
                        }}
                      >

                        <img
                          src={qrCode}
                          alt="Unique QR Code"
                          style={{
                            width:
                              "100%",

                            height:
                              "100%",

                            objectFit:
                              "contain",

                            display:
                              "block",

                            /*
                             * Keep QR rendering
                             * crisp in browser.
                             */
                            imageRendering:
                              "pixelated",
                          }}
                        />

                      </div>

                    </div>

                  </div>

                </div>

              </div>

            </div>

            {/* ==================================================
                PASS INFORMATION
                ================================================== */}

            <div className="mt-5 text-center">

              <p className="text-gray-500 text-sm">
                Pass ID
              </p>

              <p className="font-mono text-lg mt-1">
                {passId}
              </p>

              <p className="text-gray-600 text-xs mt-3">
                The QR code contains a unique token linked to this
                pass in the database.
              </p>

            </div>

          </div>

        )}

      </div>

    </main>
  );
}