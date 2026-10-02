"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  findExistingPasses,
  issuePass,
  type PassStudent,
} from "@/lib/pass-generator";

// ============================================================
// TYPES
// ============================================================

type RowStatus =
  | "READY"
  | "INVALID"
  | "DUPLICATE"
  | "EXISTS"
  | "PENDING"
  | "SENT"
  | "EMAIL_FAILED"
  | "FAILED"
  | "SKIPPED";

type Row = PassStudent & {
  index: number;
  status: RowStatus;
  note: string;
  passId: string;
};

// Delay between emails so Gmail doesn't rate-limit us.
const DELAY_MS = 1500;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================
// JSON PARSING
//
// Accepts either:
//   [ { "name": "...", "rollNumber": "...", "email": "..." } ]
// or:
//   { "students": [ ... ] }
//
// Common key variations are also accepted
// (studentName, roll_number, rollNo, email_id, ...).
// ============================================================

function pick(
  obj: Record<string, unknown>,
  keys: string[]
): string {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    normalized[key.toLowerCase().replace(/[\s_-]/g, "")] = value;
  }

  for (const key of keys) {
    const value = normalized[key];

    if (value !== undefined && value !== null) {
      return String(value).trim();
    }
  }

  return "";
}

function parseStudents(text: string): Row[] {
  const data = JSON.parse(text);

  const list: unknown =
    Array.isArray(data)
      ? data
      : data?.students ?? data?.passes ?? data?.data;

  if (!Array.isArray(list)) {
    throw new Error(
      "JSON must be an array of students, or an object with a \"students\" array."
    );
  }

  const seen = new Set<string>();

  return list.map((item, index) => {
    const obj =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};

    const name = pick(obj, ["name", "studentname", "fullname"]);
    const rollNumber = pick(obj, ["rollnumber", "rollno", "roll"]);
    const email = pick(obj, ["email", "emailid", "mail"]);

    let status: RowStatus = "READY";
    let note = "";

    if (!name || !rollNumber || !email) {
      status = "INVALID";
      note = "Missing name, roll number or email";
    } else if (!EMAIL_REGEX.test(email)) {
      status = "INVALID";
      note = "Invalid email";
    } else if (seen.has(email.toLowerCase())) {
      status = "DUPLICATE";
      note = "Same email appears earlier in file";
    }

    seen.add(email.toLowerCase());

    return {
      index: index + 1,
      name,
      rollNumber,
      email,
      status,
      note,
      passId: "",
    };
  });
}

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// PAGE
// ============================================================

export default function BulkPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);

  const stopRef = useRef(false);

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((row) =>
        row.index === index ? { ...row, ...patch } : row
      )
    );
  }

  // ==========================================================
  // LOAD FILE
  // ==========================================================

  async function handleFile(file: File | undefined) {
    if (!file) return;

    setMessage("");
    setRows([]);
    setFileName(file.name);

    let parsed: Row[];

    try {
      parsed = parseStudents(await file.text());
    } catch (error) {
      setMessage(
        `Could not read JSON: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      return;
    }

    if (parsed.length === 0) {
      setMessage("The JSON file has no students.");
      return;
    }

    setRows(parsed);

    // Mark students who already have a pass in Supabase.
    setChecking(true);

    try {
      const emails = parsed
        .filter((row) => row.email)
        .flatMap((row) => [row.email, row.email.toLowerCase()]);

      const existing = await findExistingPasses([
        ...new Set(emails),
      ]);

      setRows(
        parsed.map((row) => {
          const passId = existing.get(row.email.toLowerCase());

          return row.status === "READY" && passId
            ? {
                ...row,
                status: "EXISTS",
                note: `Already has pass ${passId}`,
                passId,
              }
            : row;
        })
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not check existing passes."
      );
    } finally {
      setChecking(false);
    }
  }

  // ==========================================================
  // SEND ALL
  // ==========================================================

  async function sendAll() {
    const queue = rows.filter(
      (row) =>
        row.status === "READY" ||
        row.status === "FAILED" ||
        (!skipExisting && row.status === "EXISTS")
    );

    if (queue.length === 0) {
      setMessage("No students to send.");
      return;
    }

    const confirmed = window.confirm(
      `Generate and email ${queue.length} pass(es)?`
    );

    if (!confirmed) return;

    stopRef.current = false;
    setRunning(true);
    setMessage("");

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < queue.length; i++) {
      const row = queue[i];

      if (stopRef.current) {
        updateRow(row.index, { status: "SKIPPED", note: "Stopped" });
        continue;
      }

      setMessage(`Processing ${i + 1} of ${queue.length}: ${row.name}`);
      updateRow(row.index, { status: "PENDING", note: "Starting..." });

      try {
        const result = await issuePass(row, (step) =>
          updateRow(row.index, { note: step })
        );

        if (result.emailSent) {
          sent++;
          updateRow(row.index, {
            status: "SENT",
            note: "Pass sent",
            passId: result.passId,
          });
        } else {
          failed++;
          // Pass exists in DB, but email failed. Do not auto-retry
          // (that would create a second pass for the same person).
          updateRow(row.index, {
            status: "EMAIL_FAILED",
            note: `Pass created, email failed: ${result.emailError}`,
            passId: result.passId,
          });
        }
      } catch (error) {
        failed++;
        updateRow(row.index, {
          status: "FAILED",
          note: error instanceof Error ? error.message : "Unknown error",
        });
      }

      if (i < queue.length - 1 && !stopRef.current) {
        await sleep(DELAY_MS);
      }
    }

    setRunning(false);
    setMessage(
      `Done. ✅ ${sent} sent, ❌ ${failed} failed${stopRef.current ? " (stopped early)" : ""}.`
    );
  }

  // ==========================================================
  // DOWNLOAD REPORT
  // ==========================================================

  function downloadReport() {
    const report = rows.map(
      ({ index, name, rollNumber, email, status, note, passId }) => ({
        index,
        name,
        rollNumber,
        email,
        status,
        passId,
        note,
      })
    );

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pass-report-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ==========================================================
  // UI
  // ==========================================================

  const count = (status: RowStatus) =>
    rows.filter((row) => row.status === status).length;

  const toSend =
    count("READY") + count("FAILED") + (skipExisting ? 0 : count("EXISTS"));

  const statusStyle: Record<RowStatus, string> = {
    READY: "text-gray-300",
    INVALID: "text-red-400",
    DUPLICATE: "text-yellow-400",
    EXISTS: "text-yellow-400",
    PENDING: "text-blue-400",
    SENT: "text-green-400",
    EMAIL_FAILED: "text-orange-400",
    FAILED: "text-red-400",
    SKIPPED: "text-gray-500",
  };

  return (
    <main className="min-h-screen bg-black text-white px-4 py-10">
      <div className="max-w-6xl mx-auto">
        {/* HEADER */}

        <div className="text-center mb-10">
          <p className="text-xs md:text-sm tracking-[0.3em] text-gray-400 uppercase">
            Department of Computer Science & Engineering
          </p>

          <h1 className="text-5xl md:text-6xl font-black mt-4">
            VIBE.EXE <span className="text-gray-500">2.0</span>
          </h1>

          <p className="text-gray-500 mt-3">Bulk Pass Sender</p>

          <Link
            href="/"
            className="inline-block mt-5 text-sm text-gray-400 hover:text-white"
          >
            ← Single pass
          </Link>
        </div>

        {/* UPLOAD */}

        <div className="max-w-xl mx-auto bg-zinc-950 border border-zinc-800 rounded-2xl p-7">
          <h2 className="text-2xl font-bold">Upload JSON</h2>

          <p className="text-sm text-gray-500 mt-2 mb-5">
            Each student gets a unique pass and QR code, emailed automatically.
            Keep this tab open until sending finishes.
          </p>

          <pre className="bg-black border border-zinc-800 rounded-lg p-3 text-xs text-gray-400 overflow-x-auto mb-5">
{`[
  { "name": "Rahul Das", "rollNumber": "CSE26001", "email": "rahul@example.com" },
  { "name": "Priya Sharma", "rollNumber": "CSE26002", "email": "priya@example.com" }
]`}
          </pre>

          <label className="block w-full cursor-pointer border border-dashed border-zinc-700 rounded-lg px-4 py-6 text-center hover:border-white transition">
            <span className="text-sm text-gray-300">
              {fileName || "Choose .json file"}
            </span>

            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              disabled={running}
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>

          <a
            href="/sample-students.json"
            download
            className="block text-xs text-gray-500 hover:text-white mt-3 text-center"
          >
            Download sample JSON
          </a>

          {rows.length > 0 && (
            <>
              <label className="flex items-center gap-2 mt-5 text-sm text-gray-400">
                <input
                  type="checkbox"
                  checked={skipExisting}
                  disabled={running}
                  onChange={(e) => setSkipExisting(e.target.checked)}
                />
                Skip students who already have a pass ({count("EXISTS")})
              </label>

              <div className="flex gap-3 mt-5">
                {!running ? (
                  <button
                    onClick={sendAll}
                    disabled={checking || toSend === 0}
                    className="flex-1 bg-white text-black font-bold py-3.5 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
                  >
                    {checking ? "CHECKING..." : `SEND ${toSend} PASS(ES)`}
                  </button>
                ) : (
                  <button
                    onClick={() => (stopRef.current = true)}
                    className="flex-1 bg-red-500 text-white font-bold py-3.5 rounded-lg hover:bg-red-600 transition"
                  >
                    STOP
                  </button>
                )}

                <button
                  onClick={downloadReport}
                  disabled={running}
                  className="px-4 border border-zinc-700 rounded-lg text-sm hover:border-white transition disabled:opacity-50"
                >
                  Report
                </button>
              </div>
            </>
          )}

          {message && (
            <div className="mt-5 bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm">
              {message}
            </div>
          )}
        </div>

        {/* TABLE */}

        {rows.length > 0 && (
          <div className="mt-10">
            <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-4">
              <span>Total: {rows.length}</span>
              <span className="text-green-400">Sent: {count("SENT")}</span>
              <span className="text-red-400">
                Failed: {count("FAILED") + count("EMAIL_FAILED")}
              </span>
              <span className="text-yellow-400">
                Skipped: {count("EXISTS") + count("DUPLICATE") + count("INVALID")}
              </span>
            </div>

            <div className="overflow-x-auto border border-zinc-800 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-zinc-950 text-gray-400 text-left">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Roll No.</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Pass ID</th>
                    <th className="px-3 py-2">Note</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => (
                    <tr key={row.index} className="border-t border-zinc-900">
                      <td className="px-3 py-2 text-gray-500">{row.index}</td>
                      <td className="px-3 py-2">{row.name || "—"}</td>
                      <td className="px-3 py-2">{row.rollNumber || "—"}</td>
                      <td className="px-3 py-2">{row.email || "—"}</td>
                      <td className={`px-3 py-2 font-mono text-xs ${statusStyle[row.status]}`}>
                        {row.status}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{row.passId}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
