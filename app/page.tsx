"use client";

import { useState } from "react";
import QRCode from "qrcode";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  createPassImage,
  uploadPassImage,
} from "@/lib/pass-generator";

export default function Home() {
  const [name, setName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [branch, setBranch] = useState("CSE");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [batch, setBatch] = useState("CSE26");
  const [email, setEmail] = useState("");

  const [qrCode, setQrCode] = useState("");
  const [passId, setPassId] = useState("");
  const [generatedName, setGeneratedName] = useState("");
  const [passImage, setPassImage] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // ============================================================
  // GENERATE PASS
  // ============================================================

  async function generatePass() {
    // Validate form.
    if (
      !name.trim() ||
      !rollNumber.trim() ||
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
    setPassImage("");

    try {
      // ========================================================
      // UNIQUE PASS ID
      // ========================================================

      const generatedPassId =
        "VX26-" +
        Math.random()
          .toString(36)
          .substring(2, 10)
          .toUpperCase();

      // ========================================================
      // UNIQUE QR TOKEN
      // ========================================================

      const qrToken =
        crypto.randomUUID();

      // ========================================================
      // SAVE PASS IN SUPABASE
      // ========================================================

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

      // ========================================================
      // GENERATE HIGH-RESOLUTION QR
      // ========================================================

      const qr =
        await QRCode.toDataURL(
          qrToken,
          {
            width: 1200,

            margin: 1,

            errorCorrectionLevel:
              "H",

            color: {
              dark: "#000000",
              light: "#FFFFFF",
            },
          }
        );

      setQrCode(qr);

      setPassId(
        generatedPassId
      );

      setGeneratedName(
        name.trim()
      );

      // ========================================================
      // CREATE ONE FINAL PASS IMAGE
      // ========================================================

      setMessage(
        "Generating high-resolution pass..."
      );

      const generatedPassImage =
        await createPassImage(
          name.trim(),
          qr
        );

      /*
       * IMPORTANT:
       *
       * This exact image is used everywhere:
       *
       * Website preview
       * Supabase Storage
       * Gmail attachment
       */

      setPassImage(
        generatedPassImage
      );

      // ========================================================
      // UPLOAD FINAL IMAGE
      // ========================================================

      setMessage(
        "Uploading pass image..."
      );

      const passImageUrl =
        await uploadPassImage(
          generatedPassImage,
          generatedPassId
        );

      // ========================================================
      // SEND EMAIL
      // ========================================================

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

              passImageUrl:
                passImageUrl,
            }),
          }
        );

      const emailResult =
        await emailResponse.json();

      // ========================================================
      // EMAIL ERROR
      // ========================================================

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

      // ========================================================
      // SUCCESS
      // ========================================================

      setMessage(
        `✅ Pass generated and sent to ${email.trim()}`
      );

      // Clear form.
      setName("");
      setRollNumber("");
      setEmail("");

    } catch (error) {
      console.error(
        "Generate pass error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );

    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // UI
  // ============================================================

  return (
    <main className="min-h-screen bg-black text-white px-4 py-10">

      <div className="max-w-6xl mx-auto">

        {/* ====================================================
            HEADER
            ==================================================== */}

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

          <Link
            href="/bulk"
            className="inline-block mt-5 text-sm border border-zinc-700 rounded-lg px-4 py-2 text-gray-300 hover:border-white hover:text-white transition"
          >
            Bulk send from JSON →
          </Link>

        </div>

        {/* ====================================================
            GENERATE FORM
            ==================================================== */}

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
                  setName(e.target.value)
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
              onClick={generatePass}
              disabled={loading}
              className="w-full bg-white text-black font-bold py-3.5 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
            >
              {loading
                ? "GENERATING & SENDING..."
                : "GENERATE & SEND PASS"}
            </button>

          </div>

          {/* MESSAGE */}

          {message && (
            <div className="mt-5 bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm">
              {message}
            </div>
          )}

        </div>

        {/* ====================================================
            GENERATED PASS
            ==================================================== */}

        {passImage && passId && (

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
                IMPORTANT:
                SHOW THE ACTUAL FINAL PNG.
                
                This is exactly the same image that is emailed.
                ================================================== */}

            <div className="w-full bg-zinc-900 p-3 md:p-4 rounded-2xl overflow-hidden">

              <div className="w-full flex justify-center">

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={passImage}
                  alt="Generated VIBE.EXE 2.0 Pass"
                  className="w-full h-auto rounded-lg block"
                />

              </div>

            </div>

            {/* PASS INFORMATION */}

            <div className="mt-5 text-center">

              <p className="text-gray-500 text-sm">
                Pass ID
              </p>

              <p className="font-mono text-lg mt-1">
                {passId}
              </p>

              <p className="text-gray-600 text-xs mt-3">
                The QR code contains a unique token linked
                to this pass in the database.
              </p>

            </div>

          </div>

        )}

      </div>

    </main>
  );
}