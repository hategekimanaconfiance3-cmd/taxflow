'use client';

export default function ErrorBoundary({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-red-200 bg-red-50 p-6">
            <div className="text-center space-y-4">
                <h2 className="text-lg font-semibold text-red-800">
                    Something went wrong
                </h2>
                <p className="text-sm text-red-600">
                    {error.message || 'Failed to load page'}
                </p>
                <button
                    onClick={reset}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}
