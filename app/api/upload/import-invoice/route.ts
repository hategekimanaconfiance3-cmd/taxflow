import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "imports");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["application/pdf"];

/**
 * POST /api/upload/import-invoice
 * Accepts a single PDF file upload. Returns the public URL path.
 */
export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;

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

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "File size must be under 10 MB" },
                { status: 400 },
            );
        }

        // Ensure upload directory exists
        if (!existsSync(UPLOAD_DIR)) {
            await mkdir(UPLOAD_DIR, { recursive: true });
        }

        // Generate unique filename
        const timestamp = Date.now();
        const safeOriginal = file.name
            .replace(/[^a-zA-Z0-9._-]/g, "_")
            .slice(0, 100);
        const filename = `${timestamp}_${safeOriginal}`;

        // Write file to disk
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
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
