import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { auth } from "@/lib/auth";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "imports");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["application/pdf"];

/**
 * POST /api/upload/import-invoice
 * Accepts a single PDF file upload. Returns the public URL path.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth.api.getSession({ headers: req.headers });
        if (!session?.user) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        if (!["manufacturer", "wholesaler", "retailer"].includes(session.user.role ?? "")) {
            return NextResponse.json({ error: "Trader account required" }, { status: 403 });
        }
        const formData = await req.formData();
        const formValue = formData.get("file");
        const file = formValue instanceof File ? formValue : null;

        if (!file) {
            return NextResponse.json(
                { error: "No file provided" },
                { status: 400 },
            );
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: "Only PDF files are allowed" },
                { status: 400 },
            );
        }

        if (file.size === 0 || file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "File must be between 1 byte and 10 MB" },
                { status: 400 },
            );
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
            return NextResponse.json({ error: "The uploaded file is not a valid PDF" }, { status: 400 });
        }

        // Ensure upload directory exists
        if (!existsSync(UPLOAD_DIR)) {
            await mkdir(UPLOAD_DIR, { recursive: true });
        }

        // Generate unique filename
        const filename = `${crypto.randomUUID()}.pdf`;

        // Write file to disk
        const filepath = join(UPLOAD_DIR, filename);
        await writeFile(filepath, buffer);

        // Return the public URL
        const url = `/uploads/imports/${filename}`;

        return NextResponse.json({ url, filename });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json(
            { error: "Upload failed" },
            { status: 500 },
        );
    }
}
