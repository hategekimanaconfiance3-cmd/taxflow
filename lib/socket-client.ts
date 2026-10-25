"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { io, Socket } from "socket.io-client";

let globalSocket: Socket | null = null;
let globalSocketUserId: string | null = null;

function getSocket(userId: string): Socket {
    if (globalSocket && globalSocketUserId !== userId) {
        globalSocket.disconnect();
        globalSocket = null;
    }

    if (!globalSocket) {
        globalSocket = io({
            path: "/api/socketio",
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });
        globalSocketUserId = userId;
    }
    return globalSocket;
}

export function disconnectSocket(): void {
    globalSocket?.disconnect();
    globalSocket = null;
    globalSocketUserId = null;
}

/**
 * Hook to subscribe to real-time events.
 *
 * Usage:
 * ```tsx
 * useSocket(userId, {
 *   "txn:incoming": (data) => router.refresh(),
 *   "txn:confirmed": (data) => router.refresh(),
 * });
 * ```
 */
export function useSocket(
    userId: string | undefined,
    events?: Record<string, (data: unknown) => void>,
) {
    const eventsRef = useRef(events);

    useEffect(() => {
        eventsRef.current = events;
    }, [events]);

    const connected = useSyncExternalStore(
        (onChange) => {
            if (!userId) return () => undefined;
            const socket = getSocket(userId);
            socket.on("connect", onChange);
            socket.on("disconnect", onChange);
            return () => {
                socket.off("connect", onChange);
                socket.off("disconnect", onChange);
            };
        },
        () => Boolean(userId && globalSocketUserId === userId && globalSocket?.connected),
        () => false,
    );

    useEffect(() => {
        if (!userId) return;

        const socket = getSocket(userId);

        // Subscribe to events
        const eventNames = Object.keys(eventsRef.current || {});
        for (const event of eventNames) {
            socket.on(event, (data: unknown) => {
                eventsRef.current?.[event]?.(data);
            });
        }

        return () => {
            for (const event of eventNames) {
                socket.off(event);
            }
        };
    }, [userId]);

    return { connected };
}

/**
 * Hook to get connection status only.
 */
export function useSocketStatus(userId: string | undefined) {
    return useSocket(userId);
}
