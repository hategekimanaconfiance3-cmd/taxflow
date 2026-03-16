"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

let globalSocket: Socket | null = null;

function getSocket(userId: string): Socket {
    if (!globalSocket) {
        globalSocket = io({
            path: "/api/socketio",
            transports: ["websocket", "polling"],
            auth: { userId },
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });
    }
    return globalSocket;
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
    const [connected, setConnected] = useState(false);
    const eventsRef = useRef(events);
    eventsRef.current = events;

    useEffect(() => {
        if (!userId) return;

        const socket = getSocket(userId);

        function onConnect() {
            setConnected(true);
        }
        function onDisconnect() {
            setConnected(false);
        }

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);

        // Set initial state
        setConnected(socket.connected);

        // Subscribe to events
        const eventNames = Object.keys(eventsRef.current || {});
        for (const event of eventNames) {
            socket.on(event, (data: unknown) => {
                eventsRef.current?.[event]?.(data);
            });
        }

        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
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
