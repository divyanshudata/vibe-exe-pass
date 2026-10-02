"use client";

import { useState, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { Bubblegum_Sans } from "next/font/google";

const bubblegum = Bubblegum_Sans({
  weight: "400",
  subsets: ["latin"],
});

// ============================================================
// TYPES
// ============================================================

type Student = {
  name: string;
  phone?: string;
  email: string;
  roll_number: string;
  branch: string;
  batch: string;
};

type ProcessStatus =
  | "pending"
  | "generating"
  | "uploading"
  | "emailing"
  | "done"
  | "error";

type StudentProgress = {
  student: Student;
  status: ProcessStatus;
  passId: string;
  message: string;
};

// ============================================================
// PASS IMAGE GENERATOR
// ============================================================

async function createPassImage(
  studentName: string,
  qrDataUrl: string
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const DESIGN_WIDTH = 1600;
      const DESIGN_HEIGHT = 900;
      const SCALE = 2;

      const canvas = document.createElement("canvas");
      canvas.width = DESIGN_WIDTH * SCALE;
      canvas.height = DESIGN_HEIGHT * SCALE;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create canvas."));
        return;
      }

      await document.fonts.ready;
      try {
        await document.fonts.load(
          `400 52px ${bubblegum.style.fontFamily}`
        );
      } catch {
        // Ignore font load failure
      }

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

          const nameLeft = DESIGN_WIDTH * 0.055;
          const nameTop = DESIGN_HEIGHT * 0.435;
          const nameWidth = DESIGN_WIDTH * 0.47;
          const nameHeight = DESIGN_HEIGHT * 0.15;
          const namePaddingLeft = DESIGN_WIDTH * 0.022;
          const fontSize = 52 * SCALE;
          const nameX = (nameLeft + namePaddingLeft) * SCALE;
          const nameY = (nameTop + nameHeight / 2) * SCALE;
          const maxNameWidth = (nameWidth - namePaddingLeft) * SCALE;

          ctx.save();
          ctx.font = `800 ${fontSize}px ${bubblegum.style.fontFamily}`;
          ctx.fillStyle = "#111111";
          ctx.textBaseline = "middle";

          let displayName = studentName;
          while (
            ctx.measureText(displayName).width > maxNameWidth &&
            displayName.length > 3
          ) {
            displayName = displayName.slice(0, -1);
          }
          if (displayName !== studentName) {
            while (
              ctx.measureText(displayName + "...").width >
                maxNameWidth &&
              displayName.length > 3
            ) {
              displayName = displayName.slice(0, -1);
            }
            displayName += "...";
          }
          ctx.fillText(displayName, nameX, nameY);
          ctx.restore();

          const qrLeft = DESIGN_WIDTH * 0.643;
          const qrTop = DESIGN_HEIGHT * 0.618;
          const qrSize = DESIGN_WIDTH * 0.07;
          const qrSizeHigh = qrSize * SCALE;
          const qrX = qrLeft * SCALE;
          const qrY = qrTop * SCALE;

          const qrImage = new Image();
          qrImage.onload = () => {
            try {
              const centerX = qrX + qrSizeHigh / 2;
              const centerY = qrY + qrSizeHigh / 2;

              ctx.save();
              ctx.translate(centerX, centerY);
              ctx.rotate((21.5 * Math.PI) / 180);
              const skewY = Math.tan((-5.6 * Math.PI) / 180);
              ctx.transform(1, skewY, 0, 1, 0, 0);
              ctx.translate(-qrSizeHigh / 2, -qrSizeHigh / 2);

              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, qrSizeHigh, qrSizeHigh);

              const qrPadding = 6 * SCALE;
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(
                qrImage,
                qrPadding,
                qrPadding,
                qrSizeHigh - qrPadding * 2,
                qrSizeHigh - qrPadding * 2
              );
              ctx.restore();

              const finalImage = canvas.toDataURL("image/png");
              resolve(finalImage);
            } catch (error) {
              reject(error);
            }
          };
          qrImage.onerror = () =>
            reject(new Error("Could not load QR code."));
          qrImage.src = qrDataUrl;
        } catch (error) {
          reject(error);
        }
      };

      background.onerror = () =>
        reject(new Error("Could not load pass template."));
      background.src = "/pass-template.png";
    } catch (error) {
      reject(error);
    }
  });
}

// ============================================================
// UPLOAD PASS IMAGE
// ============================================================

async function uploadPassImage(
  imageDataUrl: string,
  generatedPassId: string
): Promise<string> {
  const imageResponse = await fetch(imageDataUrl);
  if (!imageResponse.ok) {
    throw new Error("Could not prepare pass image.");
  }
  const imageBlob = await imageResponse.blob();
  const filePath = `passes/${generatedPassId}.png`;

  const { error: uploadError } = await supabase.storage
    .from("pass-images")
    .upload(filePath, imageBlob, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Could not upload pass image: ${uploadError.message}`);
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("pass-images")
    .createSignedUrl(filePath, 600);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    throw new Error("Could not create pass image URL.");
  }

  return signedUrlData.signedUrl;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");

  // ============================================================
  // SINGLE GENERATION STATE
  // ============================================================
  const [name, setName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [branch, setBranch] = useState("CSE");
  const [batch, setBatch] = useState("CSE26");
  const [email, setEmail] = useState("");

  const [qrCode, setQrCode] = useState("");
  const [passId, setPassId] = useState("");
  const [passImage, setPassImage] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // ============================================================
  // BULK GENERATION STATE
  // ============================================================
  const [students, setStudents] = useState<Student[]>([]);
  const [progress, setProgress] = useState<StudentProgress[]>([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [parseError, setParseError] = useState("");
  const [summary, setSummary] = useState({ total: 0, done: 0, error: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  // ============================================================
  // SINGLE GENERATION LOGIC
  // ============================================================
  async function generatePassSingle() {
    if (!name.trim() || !rollNumber.trim() || !email.trim()) {
      setMessage("Please fill all fields, including Email ID.");
      return;
    }

    setLoading(true);
    setMessage("");
    setQrCode("");
    setPassId("");
    setPassImage("");

    try {
      const generatedPassId =
        "VX26-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      const qrToken = crypto.randomUUID();

      const { error } = await supabase.from("passes").insert({
        pass_id: generatedPassId,
        student_name: name.trim(),
        roll_number: rollNumber.trim(),
        branch: branch.trim(),
        batch: batch.trim(),
        email: email.trim(),
        event_name: "VIBE.EXE 2.0",
        event_date: "2026-10-04",
        event_time: "10:00 AM onwards",
        venue: "Balle Balle Restaurant & Banquet",
        qr_token: qrToken,
        status: "ACTIVE",
      });

      if (error) {
        throw new Error(`Failed to insert pass: ${error.message}`);
      }

      const qr = await QRCode.toDataURL(qrToken, {
        width: 1200,
        margin: 1,
        errorCorrectionLevel: "H",
        color: { dark: "#000000", light: "#FFFFFF" },
      });

      setQrCode(qr);
      setPassId(generatedPassId);

      setMessage("Generating high-resolution pass...");
      const generatedPassImage = await createPassImage(name.trim(), qr);
      setPassImage(generatedPassImage);

      setMessage("Uploading pass image...");
      const passImageUrl = await uploadPassImage(
        generatedPassImage,
        generatedPassId
      );

      setMessage("Sending pass to email...");
      const emailResponse = await fetch("/api/send-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          studentName: name.trim(),
          passId: generatedPassId,
          passImageUrl: passImageUrl,
        }),
      });

      const emailResult = await emailResponse.json();

      if (!emailResponse.ok || !emailResult.success) {
        throw new Error(emailResult.message || "Failed to send email.");
      }

      setMessage(`✅ Pass generated and sent to ${email.trim()}`);
      setName("");
      setRollNumber("");
      setEmail("");
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // BULK GENERATION LOGIC
  // ============================================================

  const parseFile = useCallback((file: File) => {
    setParseError("");
    setProgress([]);
    setSummary({ total: 0, done: 0, error: 0 });

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string);
        if (!Array.isArray(raw) || raw.length === 0) {
          setParseError("JSON file must be a non-empty array of student objects.");
          return;
        }

        const requiredKeys = ["name", "email", "roll_number", "branch", "batch"];
        const errors: string[] = [];

        raw.forEach((item: Record<string, string>, i: number) => {
          requiredKeys.forEach((key) => {
            if (!item[key] || typeof item[key] !== "string" || !item[key].trim()) {
              errors.push(`Row ${i + 1}: Missing or empty "${key}".`);
            }
          });
        });

        if (errors.length > 0) {
          setParseError(errors.slice(0, 5).join("\n"));
          return;
        }

        const parsed: Student[] = raw.map((item: Record<string, string>) => ({
          name: item.name.trim(),
          phone: (item.phone || "").trim(),
          email: item.email.trim(),
          roll_number: item.roll_number.trim(),
          branch: item.branch.trim(),
          batch: item.batch.trim(),
        }));

        setStudents(parsed);
      } catch {
        setParseError("Could not parse the file. Make sure it is valid JSON.");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }, [parseFile]);

  async function processStudent(student: Student, index: number) {
    const update = (partial: Partial<StudentProgress>) => {
      setProgress((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...partial };
        return next;
      });
    };

    try {
      update({ status: "generating", message: "Generating pass..." });
      const generatedPassId =
        "VX26-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      const qrToken = crypto.randomUUID();

      const { error } = await supabase.from("passes").insert({
        pass_id: generatedPassId,
        student_name: student.name,
        roll_number: student.roll_number,
        branch: student.branch,
        batch: student.batch,
        email: student.email,
        event_name: "VIBE.EXE 2.0",
        event_date: "2026-10-04",
        event_time: "10:00 AM onwards",
        venue: "Balle Balle Restaurant & Banquet",
        qr_token: qrToken,
        status: "ACTIVE",
      });
      if (error) throw new Error(error.message);

      const qr = await QRCode.toDataURL(qrToken, {
        width: 1200,
        margin: 1,
        errorCorrectionLevel: "H",
        color: { dark: "#000000", light: "#FFFFFF" },
      });

      const passImage = await createPassImage(student.name, qr);

      update({
        status: "uploading",
        passId: generatedPassId,
        message: "Uploading image...",
      });

      const passImageUrl = await uploadPassImage(passImage, generatedPassId);

      update({ status: "emailing", message: "Sending email..." });

      const emailResponse = await fetch("/api/send-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: student.email,
          studentName: student.name,
          passId: generatedPassId,
          passImageUrl,
        }),
      });

      const emailResult = await emailResponse.json();
      if (!emailResponse.ok || !emailResult.success) {
        throw new Error(emailResult.message || "Email sending failed.");
      }

      update({
        status: "done",
        message: `✅ Sent to ${student.email}`,
      });
      setSummary((prev) => ({ ...prev, done: prev.done + 1 }));
    } catch (error) {
      update({
        status: "error",
        message: error instanceof Error ? `❌ ${error.message}` : "❌ Unknown error",
      });
      setSummary((prev) => ({ ...prev, error: prev.error + 1 }));
    }
  }

  async function startBulk() {
    if (students.length === 0) return;
    abortRef.current = false;
    setIsProcessingBulk(true);
    setSummary({ total: students.length, done: 0, error: 0 });

    const initialProgress: StudentProgress[] = students.map((s) => ({
      student: s,
      status: "pending",
      passId: "",
      message: "Waiting...",
    }));
    setProgress(initialProgress);

    const BATCH_SIZE = 3;
    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      if (abortRef.current) break;
      const batch = students
        .slice(i, i + BATCH_SIZE)
        .map((_, j) => processStudent(students[i + j], i + j));
      await Promise.all(batch);
      if (i + BATCH_SIZE < students.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    setIsProcessingBulk(false);
  }

  function stopBulk() {
    abortRef.current = true;
  }

  function resetBulk() {
    setStudents([]);
    setProgress([]);
    setParseError("");
    setSummary({ total: 0, done: 0, error: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function statusColor(status: ProcessStatus) {
    switch (status) {
      case "pending": return "text-zinc-500";
      case "generating": return "text-blue-400";
      case "uploading": return "text-yellow-400";
      case "emailing": return "text-purple-400";
      case "done": return "text-emerald-400";
      case "error": return "text-red-400";
    }
  }

  function statusLabel(status: ProcessStatus) {
    switch (status) {
      case "pending": return "PENDING";
      case "generating": return "GENERATING";
      case "uploading": return "UPLOADING";
      case "emailing": return "EMAILING";
      case "done": return "DONE";
      case "error": return "FAILED";
    }
  }

  const completedPercent =
    summary.total > 0
      ? Math.round(((summary.done + summary.error) / summary.total) * 100)
      : 0;

  // ============================================================
  // UI
  // ============================================================

  return (
    <main className="min-h-screen bg-black text-white px-4 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs md:text-sm tracking-[0.3em] text-gray-400 uppercase">
            Department of Computer Science & Engineering
          </p>
          <h1 className="text-5xl md:text-6xl font-black mt-4">
            VIBE.EXE <span className="text-gray-500">2.0</span>
          </h1>
          <p className="text-gray-500 mt-3">Freshers Pass Management System</p>
        </div>

        <div className="max-w-xl mx-auto mb-8 flex border-b border-zinc-800">
          <button
            className={`flex-1 pb-4 text-center font-bold transition ${
              activeTab === "single"
                ? "text-white border-b-2 border-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
            onClick={() => setActiveTab("single")}
          >
            Single Generation
          </button>
          <button
            className={`flex-1 pb-4 text-center font-bold transition ${
              activeTab === "bulk"
                ? "text-white border-b-2 border-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
            onClick={() => setActiveTab("bulk")}
          >
            Bulk Generation
          </button>
        </div>

        {activeTab === "single" && (
          <div className="max-w-xl mx-auto bg-zinc-950 border border-zinc-800 rounded-2xl p-7">
            <h2 className="text-2xl font-bold">Generate Pass</h2>
            <p className="text-sm text-gray-500 mt-2 mb-7">
              Generate a personalized pass with a unique QR code.
            </p>
            <div className="space-y-5">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Student Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter student name"
                  className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 outline-none focus:border-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Roll Number</label>
                <input
                  type="text"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  placeholder="Enter roll number"
                  className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 outline-none focus:border-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Email ID</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@example.com"
                  className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 outline-none focus:border-white"
                />
              </div>
              <button
                onClick={generatePassSingle}
                disabled={loading}
                className="w-full bg-white text-black font-bold py-3.5 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
              >
                {loading ? "GENERATING & SENDING..." : "GENERATE & SEND PASS"}
              </button>
            </div>
            {message && (
              <div className="mt-5 bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm">
                {message}
              </div>
            )}
          </div>
        )}

        {activeTab === "single" && passImage && passId && (
          <div className="max-w-xl mx-auto mt-12">
            <div className="mb-5">
              <h2 className="text-2xl font-bold">Generated Pass</h2>
              <p className="text-sm text-gray-500 mt-1">{passId}</p>
            </div>
            <div className="w-full bg-zinc-900 p-3 md:p-4 rounded-2xl overflow-hidden">
              <div className="w-full flex justify-center">
                <img
                  src={passImage}
                  alt="Generated VIBE.EXE 2.0 Pass"
                  className="w-full h-auto rounded-lg block"
                />
              </div>
            </div>
            <div className="mt-5 text-center">
              <p className="text-gray-500 text-sm">Pass ID</p>
              <p className="font-mono text-lg mt-1">{passId}</p>
              <p className="text-gray-600 text-xs mt-3">
                The QR code contains a unique token linked to this pass in the database.
              </p>
            </div>
          </div>
        )}

        {activeTab === "bulk" && (
          <div className="max-w-5xl mx-auto">
            {students.length === 0 && !isProcessingBulk && (
              <div className="max-w-xl mx-auto">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${
                    isDragOver
                      ? "border-white bg-zinc-900"
                      : "border-zinc-700 hover:border-zinc-500 bg-zinc-950"
                  }`}
                >
                  <div className="text-5xl mb-4">📁</div>
                  <p className="text-lg font-semibold">Drop your JSON file here</p>
                  <p className="text-sm text-gray-500 mt-2">or click to browse</p>
                  <p className="text-xs text-zinc-600 mt-4 font-mono">
                    Expected: [ {"{"} name, phone, email, roll_number, branch, batch {"}"} ]
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
                {parseError && (
                  <div className="mt-5 bg-red-950/50 border border-red-800/50 rounded-xl p-4 text-sm text-red-300 whitespace-pre-wrap font-mono">
                    {parseError}
                  </div>
                )}
              </div>
            )}

            {students.length > 0 && progress.length === 0 && (
              <div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-7 mb-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-2xl font-bold">Ready to Send</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        {students.length} student{students.length !== 1 ? "s" : ""} loaded
                      </p>
                    </div>
                    <button
                      onClick={resetBulk}
                      className="text-sm text-zinc-500 hover:text-white transition px-3 py-1.5 border border-zinc-800 rounded-lg"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-zinc-800">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-zinc-900 text-left text-zinc-400">
                          <th className="px-4 py-3 font-medium">#</th>
                          <th className="px-4 py-3 font-medium">Name</th>
                          <th className="px-4 py-3 font-medium">Roll No</th>
                          <th className="px-4 py-3 font-medium">Email</th>
                          <th className="px-4 py-3 font-medium">Phone</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((s, i) => (
                          <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                            <td className="px-4 py-3 text-zinc-500 font-mono">{i + 1}</td>
                            <td className="px-4 py-3 font-medium">{s.name}</td>
                            <td className="px-4 py-3 text-zinc-400 font-mono">{s.roll_number}</td>
                            <td className="px-4 py-3 text-zinc-400">{s.email}</td>
                            <td className="px-4 py-3 text-zinc-400">{s.phone || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <button
                  onClick={startBulk}
                  className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-gray-200 transition text-lg"
                >
                  🚀 GENERATE & SEND ALL {students.length} PASSES
                </button>
              </div>
            )}

            {progress.length > 0 && (
              <div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold">
                        {isProcessingBulk ? "Processing..." : "Complete"}
                      </h2>
                      <p className="text-sm text-zinc-500 mt-1">
                        {summary.done} sent · {summary.error} failed ·{" "}
                        {summary.total - summary.done - summary.error} remaining
                      </p>
                    </div>
                    {isProcessingBulk ? (
                      <button
                        onClick={stopBulk}
                        className="text-sm text-red-400 hover:text-red-300 transition px-4 py-2 border border-red-800/50 rounded-lg"
                      >
                        ⏹ Stop
                      </button>
                    ) : (
                      <button
                        onClick={resetBulk}
                        className="text-sm text-zinc-400 hover:text-white transition px-4 py-2 border border-zinc-700 rounded-lg"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${completedPercent}%`,
                        background: summary.error > 0 ? "linear-gradient(90deg, #10b981, #ef4444)" : "#10b981",
                      }}
                    />
                  </div>
                  <p className="text-right text-xs text-zinc-500 mt-2">{completedPercent}%</p>
                </div>
                <div className="space-y-2">
                  {progress.map((p, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-4 px-5 py-3.5 rounded-xl border transition-all duration-300 ${
                        p.status === "done"
                          ? "bg-emerald-950/20 border-emerald-800/30"
                          : p.status === "error"
                          ? "bg-red-950/20 border-red-800/30"
                          : p.status === "pending"
                          ? "bg-zinc-950 border-zinc-800/50"
                          : "bg-zinc-900 border-zinc-700/50"
                      }`}
                    >
                      <span className="text-zinc-600 font-mono text-sm w-8 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.student.name}</p>
                        <p className="text-xs text-zinc-500 truncate">{p.student.email}</p>
                      </div>
                      <span className={`text-xs font-mono font-bold shrink-0 ${statusColor(p.status)}`}>
                        {statusLabel(p.status)}
                      </span>
                      <p className="text-xs text-zinc-500 w-48 truncate shrink-0 text-right">
                        {p.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}