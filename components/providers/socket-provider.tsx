"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { disconnectSocket, useSocket } from "@/lib/socket-client";

interface SocketContextValue {
    connected: boolean;
    userId: string;
}

const SocketContext = createContext<SocketContextValue>({
    connected: false,
    userId: "",
});

export function useSocketContext() {
    return useContext(SocketContext);
}

interface SocketProviderProps {
    userId: string;
    children: ReactNode;
}

/**
 * Wraps the dashboard layout to establish a Socket.IO connection
 * and register the service worker for offline support.
 */
export function SocketProvider({ userId, children }: SocketProviderProps) {
    const { connected } = useSocket(userId);

    // Register service worker on mount
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js")
                .then((reg) => {
                    console.log("[SW] Registered:", reg.scope);
                })
                .catch((err) => {
                    console.warn("[SW] Registration failed:", err);
                });
        }
    }, []);

    useEffect(() => () => disconnectSocket(), []);

    return (
        <SocketContext.Provider value={{ connected, userId }}>
            {children}
        </SocketContext.Provider>
    );
}

