"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/lib/supabase";

type PassData = {
    id: string;
    pass_id: string;
    student_name: string;
    roll_number: string;
    branch: string;
    batch: string;
    event_name: string;
    event_date: string;
    event_time: string;
    venue: string;
    status: string;
    scanned_at?: string | null;
};

type ScanErrorType =
    | "INVALID"
    | "USED"
    | "CANCELLED"
    | "ERROR"
    | "";

export default function ScanPage() {
    const scannerRef = useRef<Html5Qrcode | null>(null);

    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState<PassData | null>(null);
    const [error, setError] = useState("");
    const [errorType, setErrorType] = useState<ScanErrorType>("");
    const [verifying, setVerifying] = useState(false);

    /*
     * ============================================================
     * VERIFY + CONSUME PASS
     * ============================================================
     *
     * A pass can only be accepted when its status is ACTIVE.
     *
     * First scan:
     * ACTIVE → USED
     *
     * Second scan:
     * USED → rejected
     *
     * The update also contains:
     * .eq("status", "ACTIVE")
     *
     * This prevents an already-consumed pass from being accepted
     * by another scanner.
     */

    async function verifyPass(qrToken: string) {
        if (verifying) {
            return;
        }

        try {
            setVerifying(true);
            setError("");
            setErrorType("");
            setResult(null);

            /*
             * ========================================================
             * 1. FIND PASS
             * ========================================================
             */

            const { data, error: fetchError } = await supabase
                .from("passes")
                .select("*")
                .eq("qr_token", qrToken)
                .maybeSingle();

            if (fetchError) {
                console.error("Pass lookup error:", fetchError);

                setError(
                    "Unable to verify the pass. Please try again."
                );

                setErrorType("ERROR");

                return;
            }

            /*
             * ========================================================
             * 2. QR CODE DOES NOT EXIST
             * ========================================================
             */

            if (!data) {
                setError(
                    "QR code is not registered."
                );

                setErrorType("INVALID");

                return;
            }

            /*
             * ========================================================
             * 3. PASS ALREADY USED
             * ========================================================
             */

            if (data.status === "USED") {
                setError(
                    "This pass has already been used."
                );

                setErrorType("USED");

                return;
            }

            /*
             * ========================================================
             * 4. PASS CANCELLED
             * ========================================================
             */

            if (data.status === "CANCELLED") {
                setError(
                    "This pass has been cancelled."
                );

                setErrorType("CANCELLED");

                return;
            }

            /*
             * ========================================================
             * 5. ONLY ACTIVE PASSES CAN BE ACCEPTED
             * ========================================================
             */

            if (data.status !== "ACTIVE") {
                setError(
                    "This pass is not active."
                );

                setErrorType("ERROR");

                return;
            }

            /*
             * ========================================================
             * 6. CONSUME PASS
             * ========================================================
             *
             * IMPORTANT:
             *
             * We update only if the database record is STILL ACTIVE.
             *
             * This is important when two scanners try to scan
             * the same QR almost at the same time.
             */

            const { data: updatedPass, error: updateError } =
                await supabase
                    .from("passes")
                    .update({
                        status: "USED",
                        scanned_at: new Date().toISOString(),
                    })
                    .eq("id", data.id)
                    .eq("status", "ACTIVE")
                    .select("*")
                    .maybeSingle();

            /*
             * ========================================================
             * 7. DATABASE UPDATE ERROR
             * ========================================================
             */

            if (updateError) {
                console.error(
                    "Pass consumption error:",
                    updateError
                );

                setError(
                    "Unable to validate this pass."
                );

                setErrorType("ERROR");

                return;
            }

            /*
             * ========================================================
             * 8. UPDATE RETURNED NOTHING
             * ========================================================
             *
             * This can happen if another scanner consumed the
             * pass before this update completed.
             */

            if (!updatedPass) {
                setError(
                    "This pass has already been used."
                );

                setErrorType("USED");

                return;
            }

            /*
             * ========================================================
             * 9. PASS SUCCESSFULLY CONSUMED
             * ========================================================
             */

            setResult(updatedPass);

        } catch (err) {
            console.error(
                "Pass verification error:",
                err
            );

            setError(
                "Unable to verify pass."
            );

            setErrorType("ERROR");

        } finally {
            setVerifying(false);
        }
    }

    /*
     * ============================================================
     * START SCANNER
     * ============================================================
     */

    async function startScanner() {
        setError("");
        setErrorType("");
        setResult(null);

        try {
            const scanner = new Html5Qrcode(
                "qr-reader"
            );

            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: {
                        width: 250,
                        height: 250,
                    },
                },
                async (decodedText) => {
                    console.log(
                        "QR detected:",
                        decodedText
                    );

                    /*
                     * Stop camera immediately after detecting
                     * a QR code.
                     */

                    try {
                        await scanner.stop();
                    } catch (stopError) {
                        console.error(
                            "Scanner stop error:",
                            stopError
                        );
                    }

                    try {
                        scanner.clear();
                    } catch (clearError) {
                        console.error(
                            "Scanner clear error:",
                            clearError
                        );
                    }

                    scannerRef.current = null;
                    setScanning(false);

                    /*
                     * Verify and consume pass.
                     */

                    await verifyPass(decodedText);
                },
                () => {
                    /*
                     * Ignore continuous camera scanning errors.
                     */
                }
            );

            setScanning(true);

        } catch (err) {
            console.error(
                "Camera error:",
                err
            );

            setError(
                "Unable to access camera. Please allow camera permission."
            );

            setErrorType("ERROR");
        }
    }

    /*
     * ============================================================
     * STOP SCANNER
     * ============================================================
     */

    async function stopScanner() {
        try {
            if (scannerRef.current) {
                await scannerRef.current.stop();

                try {
                    scannerRef.current.clear();
                } catch {
                    // Scanner already cleared.
                }

                scannerRef.current = null;
            }
        } catch (err) {
            console.error(
                "Stop scanner error:",
                err
            );
        }

        setScanning(false);
    }

    /*
     * ============================================================
     * SCAN AGAIN
     * ============================================================
     */

    async function scanAgain() {
        setResult(null);
        setError("");
        setErrorType("");

        await startScanner();
    }

    /*
     * ============================================================
     * CLEANUP
     * ============================================================
     */

    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                scannerRef.current
                    .stop()
                    .then(() => {
                        scannerRef.current?.clear();
                    })
                    .catch(() => { });
            }
        };
    }, []);

    /*
     * ============================================================
     * ERROR UI HELPERS
     * ============================================================
     */

    function getErrorTitle() {
        switch (errorType) {
            case "USED":
                return "ALREADY USED";

            case "CANCELLED":
                return "CANCELLED PASS";

            case "INVALID":
                return "INVALID PASS";

            case "ERROR":
                return "VERIFICATION ERROR";

            default:
                return "INVALID PASS";
        }
    }

    function getErrorIcon() {
        switch (errorType) {
            case "USED":
                return "🔴";

            case "CANCELLED":
                return "🚫";

            case "ERROR":
                return "⚠️";

            default:
                return "❌";
        }
    }

    return (
        <main className="min-h-screen bg-black text-white px-5 py-10">

            <div className="max-w-lg mx-auto">

                {/* ==================================================
                    HEADER
                ================================================== */}

                <div className="text-center mb-8">

                    <p className="text-xs tracking-[0.3em] text-gray-500 uppercase">
                        Department of Computer Science & Engineering
                    </p>

                    <h1 className="text-4xl font-black mt-4">
                        VIBE.EXE{" "}
                        <span className="text-gray-500">
                            2.0
                        </span>
                    </h1>

                    <p className="text-gray-500 mt-2">
                        Pass Verification
                    </p>

                </div>


                {/* ==================================================
                    SCANNER
                ================================================== */}

                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5">

                    <h2 className="text-xl font-bold mb-2">
                        Scan Pass
                    </h2>

                    <p className="text-sm text-gray-500 mb-5">
                        Point the camera at the QR code on the student&apos;s pass.
                    </p>


                    {/* CAMERA AREA */}

                    <div
                        id="qr-reader"
                        className="w-full overflow-hidden rounded-xl bg-black"
                    />


                    {/* ==================================================
                        START SCANNER
                    ================================================== */}

                    {!scanning && !result && !error && (

                        <button
                            onClick={startScanner}
                            disabled={verifying}
                            className="w-full mt-5 bg-white text-black font-bold py-3.5 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                        >
                            📷 START SCANNER
                        </button>

                    )}


                    {/* ==================================================
                        SCANNING
                    ================================================== */}

                    {scanning && (

                        <button
                            onClick={stopScanner}
                            className="w-full mt-5 bg-zinc-800 text-white font-bold py-3.5 rounded-lg hover:bg-zinc-700"
                        >
                            STOP SCANNER
                        </button>

                    )}


                    {/* ==================================================
                        VERIFYING
                    ================================================== */}

                    {verifying && (

                        <div className="mt-5 bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">

                            <div className="text-2xl mb-2">
                                🔍
                            </div>

                            <p className="text-sm text-gray-300">
                                Verifying pass...
                            </p>

                        </div>

                    )}


                    {/* ==================================================
                        ERROR
                    ================================================== */}

                    {error && !verifying && (

                        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-5 text-center">

                            <div className="text-4xl mb-3">
                                {getErrorIcon()}
                            </div>

                            <h3 className="text-xl font-bold text-red-400">
                                {getErrorTitle()}
                            </h3>

                            <p className="text-sm text-red-300 mt-2">
                                {error}
                            </p>


                            {/* Scan Again */}

                            <button
                                onClick={scanAgain}
                                className="mt-5 bg-white text-black px-5 py-3 rounded-lg font-bold"
                            >
                                SCAN AGAIN
                            </button>

                        </div>

                    )}


                    {/* ==================================================
                        VALID PASS
                    ================================================== */}

                    {result && (

                        <div className="mt-6 rounded-xl border border-green-800 bg-green-950/30 p-5">

                            <div className="text-center mb-5">

                                <div className="text-5xl mb-3">
                                    ✅
                                </div>

                                <h3 className="text-2xl font-black text-green-400">
                                    VALID PASS
                                </h3>

                                <p className="text-sm text-green-300 mt-1">
                                    QR code verified successfully
                                </p>

                                <p className="text-xs text-green-500 mt-2">
                                    This pass has been marked as USED.
                                </p>

                            </div>


                            {/* ==================================================
                                STUDENT DETAILS
                            ================================================== */}

                            <div className="bg-black/50 rounded-xl p-4 space-y-3">

                                {/* STUDENT */}

                                <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3">

                                    <span className="text-gray-500">
                                        Student
                                    </span>

                                    <span className="font-semibold text-right">
                                        {result.student_name}
                                    </span>

                                </div>


                                {/* ROLL NUMBER */}

                                <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3">

                                    <span className="text-gray-500">
                                        Roll Number
                                    </span>

                                    <span className="font-semibold text-right">
                                        {result.roll_number}
                                    </span>

                                </div>


                                {/* BRANCH */}

                                <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3">

                                    <span className="text-gray-500">
                                        Branch
                                    </span>

                                    <span className="font-semibold text-right">
                                        {result.branch}
                                    </span>

                                </div>


                                {/* BATCH */}

                                <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3">

                                    <span className="text-gray-500">
                                        Batch
                                    </span>

                                    <span className="font-semibold text-right">
                                        {result.batch}
                                    </span>

                                </div>


                                {/* EVENT */}

                                <div className="flex justify-between gap-4 border-b border-zinc-800 pb-3">

                                    <span className="text-gray-500">
                                        Event
                                    </span>

                                    <span className="font-semibold text-right">
                                        {result.event_name}
                                    </span>

                                </div>


                                {/* VENUE */}

                                <div className="flex justify-between gap-4">

                                    <span className="text-gray-500">
                                        Venue
                                    </span>

                                    <span className="font-semibold text-right">
                                        {result.venue}
                                    </span>

                                </div>

                            </div>


                            {/* ==================================================
                                PASS ID
                            ================================================== */}

                            <div className="mt-4 text-center">

                                <p className="text-xs text-gray-500">
                                    PASS ID
                                </p>

                                <p className="font-mono mt-1">
                                    {result.pass_id}
                                </p>

                            </div>


                            {/* ==================================================
                                SCAN TIME
                            ================================================== */}

                            {result.scanned_at && (

                                <div className="mt-3 text-center">

                                    <p className="text-xs text-gray-500">
                                        SCANNED AT
                                    </p>

                                    <p className="text-xs text-gray-400 mt-1">
                                        {new Date(
                                            result.scanned_at
                                        ).toLocaleString()}
                                    </p>

                                </div>

                            )}


                            {/* ==================================================
                                SCAN NEXT
                            ================================================== */}

                            <button
                                onClick={scanAgain}
                                className="w-full mt-5 bg-white text-black font-bold py-3 rounded-lg hover:bg-gray-200"
                            >
                                SCAN NEXT PASS
                            </button>

                        </div>

                    )}

                </div>


                {/* ==================================================
                    BACK LINK
                ================================================== */}

                <div className="text-center mt-6">

                    <Link
                        href="/"
                        className="text-sm text-gray-500 hover:text-white"
                    >
                        ← Back to Generate Pass
                    </Link>

                </div>

            </div>

        </main>
    );
}