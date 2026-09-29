import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
    const { data, error } = await supabase
        .from("passes")
        .select("*")
        .limit(5);

    if (error) {
        return NextResponse.json(
            {
                success: false,
                error: error.message,
            },
            { status: 500 }
        );
    }

    return NextResponse.json({
        success: true,
        data,
    });
}