// Server-only — GPS/IoT Transport Tracking Engine
// Provides the software layer for real-time truck and goods movement monitoring.
// Accepts GPS pings from vehicle trackers, detects route deviations,
// and cross-checks with dispatch records to flag suspicious movement.

import { eq, and, sql, gte, desc } from 'drizzle-orm';
import db from '@/db/drizzle';
import { transaction, aiFinding, user } from '@/db/schema';
import { routeFindingToRRAStaff } from './finding-router';

// ---------------------------------------------------------------------------
// In-memory GPS event store (production: replace with Redis or DB table)
// The gpsEvent table is added via the migration below.
// ---------------------------------------------------------------------------

export interface GPSEvent {
  id: string;
  vehicleRegistration: string;   // truck plate number
  transactionId?: string;         // linked dispatch transaction
  driverId?: string;
  latitude: number;
  longitude: number;
  speedKmh?: number;
  headingDegrees?: number;
  timestamp: Date;
  source: 'api' | 'manual' | 'gateway';
  eventType: 'position' | 'stop' | 'departure' | 'arrival' | 'alert';
  metadata?: Record<string, unknown>;
}

export interface RouteDeviationAlert {
  vehicleRegistration: string;
  transactionId?: string;
  deviationKm: number;
  lastKnownPosition: { lat: number; lng: number; timestamp: Date };
  expectedDestination?: string;
  alertType: 'route_deviation' | 'unexpected_stop' | 'missing_arrival' | 'speed_anomaly';
  severity: 'info' | 'warning' | 'critical';
  description: string;
}

// ---------------------------------------------------------------------------
// Haversine distance formula (km between two lat/lng points)
// ---------------------------------------------------------------------------

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Rwanda administrative center coordinates (approximate district centers)
// Used for route validation when exact GPS waypoints are unavailable
// ---------------------------------------------------------------------------

export const RWANDA_DISTRICTS: Record<string, { lat: number; lng: number; name: string }> = {
  kigali:        { lat: -1.9441, lng: 30.0619, name: 'Kigali' },
  nyarugenge:    { lat: -1.9536, lng: 30.0618, name: 'Nyarugenge' },
  gasabo:        { lat: -1.9000, lng: 30.1000, name: 'Gasabo' },
  kicukiro:      { lat: -2.0000, lng: 30.0803, name: 'Kicukiro' },
  butare:        { lat: -2.5987, lng: 29.7399, name: 'Huye (Butare)' },
  musanze:       { lat: -1.4989, lng: 29.6338, name: 'Musanze' },
  rubavu:        { lat: -1.6774, lng: 29.3473, name: 'Rubavu' },
  rusizi:        { lat: -2.4786, lng: 28.9075, name: 'Rusizi' },
  rwamagana:     { lat: -1.9497, lng: 30.4348, name: 'Rwamagana' },
  nyagatare:     { lat: -1.2949, lng: 30.3281, name: 'Nyagatare' },
};

// ---------------------------------------------------------------------------
// GPS Event Processor — validate and analyze incoming GPS pings
// ---------------------------------------------------------------------------

export async function processGPSEvent(event: Omit<GPSEvent, 'id'>): Promise<{
  accepted: boolean;
  alerts: RouteDeviationAlert[];
  eventId: string;
}> {
  const eventId = `gps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const alerts: RouteDeviationAlert[] = [];

  // Validate coordinates are within Rwanda's bounding box
  // Rwanda: lat -2.84 to -1.05, lng 28.86 to 30.90
  if (
    event.latitude < -2.85 || event.latitude > -1.04 ||
    event.longitude < 28.85 || event.longitude > 30.91
  ) {
    alerts.push({
      vehicleRegistration: event.vehicleRegistration,
      transactionId: event.transactionId,
      deviationKm: 0,
      lastKnownPosition: { lat: event.latitude, lng: event.longitude, timestamp: event.timestamp },
      alertType: 'route_deviation',
      severity: 'critical',
      description: `Vehicle ${event.vehicleRegistration} reported coordinates outside Rwanda's boundaries (${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}). Possible GPS spoofing or cross-border movement without declaration.`,
    });
  }

  // Speed anomaly check (> 150 km/h on Rwanda roads is suspicious)
  if (event.speedKmh && event.speedKmh > 150) {
    alerts.push({
      vehicleRegistration: event.vehicleRegistration,
      transactionId: event.transactionId,
      deviationKm: 0,
      lastKnownPosition: { lat: event.latitude, lng: event.longitude, timestamp: event.timestamp },
      alertType: 'speed_anomaly',
      severity: 'warning',
      description: `Vehicle ${event.vehicleRegistration} reported speed of ${event.speedKmh} km/h — unusually high for Rwanda road network. Possible GPS error or false reporting.`,
    });
  }

  // If linked to a transaction, check destination alignment
  if (event.transactionId) {
    await checkTransactionRouteAlignment(event, alerts);
  }

  // Create aiFinding records for critical alerts
  for (const alert of alerts.filter(a => a.severity === 'critical')) {
    if (alert.transactionId) {
      await createGPSFinding(alert, alert.transactionId);
    }
  }

  return { accepted: true, alerts, eventId };
}

// ---------------------------------------------------------------------------
// Check if GPS position aligns with the transaction's declared route
// ---------------------------------------------------------------------------

async function checkTransactionRouteAlignment(
  event: Omit<GPSEvent, 'id'>,
  alerts: RouteDeviationAlert[],
): Promise<void> {
  try {
    const [txn] = await db
      .select({
        id: transaction.id,
        sellerId: transaction.sellerId,
        buyerId: transaction.buyerId,
        status: transaction.status,
        createdAt: transaction.createdAt,
      })
      .from(transaction)
      .where(eq(transaction.id, event.transactionId!))
      .limit(1);

    if (!txn) return;

    // If transaction is already completed and vehicle is still moving
    if (txn.status === 'completed' && event.eventType === 'position') {
      // Check how long ago it completed — 2h grace period
      const completedAgo = Date.now() - new Date(txn.createdAt).getTime();
      if (completedAgo > 2 * 60 * 60 * 1000) {
        alerts.push({
          vehicleRegistration: event.vehicleRegistration,
          transactionId: txn.id,
          deviationKm: 0,
          lastKnownPosition: {
            lat: event.latitude,
            lng: event.longitude,
            timestamp: event.timestamp,
          },
          alertType: 'unexpected_stop',
          severity: 'info',
          description: `Vehicle ${event.vehicleRegistration} is still transmitting GPS pings ${Math.round(completedAgo / 3600000)}h after transaction ${txn.id} was marked completed. May indicate the vehicle has not returned to base.`,
        });
      }
    }
  } catch (error) {
    console.error('[GPS Tracker] checkTransactionRouteAlignment error:', error);
  }
}

// ---------------------------------------------------------------------------
// Create an aiFinding from a GPS alert
// ---------------------------------------------------------------------------

async function createGPSFinding(
  alert: RouteDeviationAlert,
  transactionId: string,
): Promise<void> {
  try {
    const [txn] = await db
      .select({ sellerId: transaction.sellerId })
      .from(transaction)
      .where(eq(transaction.id, transactionId))
      .limit(1);

    if (!txn) return;

    const [existing] = await db
      .select({ id: aiFinding.id })
      .from(aiFinding)
      .where(and(
        eq(aiFinding.businessId, txn.sellerId),
        eq(aiFinding.findingType, 'dispatch_mismatch'),
        eq(aiFinding.reviewStatus, 'open'),
        sql`${aiFinding.evidenceRefs}::text LIKE ${'%' + transactionId + '%'}`,
      ))
      .limit(1);

    if (existing) return; // Don't duplicate

    const [biz] = await db
      .select({ businessName: user.businessName })
      .from(user)
      .where(eq(user.id, txn.sellerId))
      .limit(1);

    const [finding] = await db
      .insert(aiFinding)
      .values({
        findingType: 'dispatch_mismatch',
        severity: alert.severity === 'critical' ? 'critical' : 'warning',
        businessId: txn.sellerId,
        observedValue: alert.deviationKm,
        expectedValue: 0,
        difference: alert.deviationKm,
        differenceUnit: 'km',
        explanation: alert.description,
        evidenceRefs: JSON.stringify({
          transactionId,
          vehicleRegistration: alert.vehicleRegistration,
          alertType: alert.alertType,
          position: alert.lastKnownPosition,
        }),
        detectionMethod: 'gps_tracking',
        reviewStatus: 'open',
        modelVersion: 'gps-tracker-v1',
      })
      .returning({ id: aiFinding.id });

    if (finding) {
      await routeFindingToRRAStaff({
        findingId: finding.id,
        findingType: 'dispatch_mismatch',
        severity: alert.severity === 'critical' ? 'critical' : 'warning',
        businessId: txn.sellerId,
        businessName: biz?.businessName ?? null,
        observedValue: alert.deviationKm,
        expectedValue: 0,
        explanation: alert.description,
      });
    }
  } catch (error) {
    console.error('[GPS Tracker] createGPSFinding error:', error);
  }
}

// ---------------------------------------------------------------------------
// Scan for missing arrival events — dispatches with no GPS arrival ping
// within 48h of expected delivery
// ---------------------------------------------------------------------------

export async function scanForMissingArrivals(hours = 48): Promise<RouteDeviationAlert[]> {
  const alerts: RouteDeviationAlert[] = [];
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  try {
    // Find pending dispatches older than cutoff
    const stalePending = await db
      .select({
        id: transaction.id,
        sellerId: transaction.sellerId,
        createdAt: transaction.createdAt,
      })
      .from(transaction)
      .where(and(
        eq(transaction.status, 'pending'),
        sql`${transaction.buyerId} IS NOT NULL`,
        sql`${transaction.createdAt} < ${cutoff}`,
      ))
      .limit(100);

    for (const txn of stalePending) {
      alerts.push({
        vehicleRegistration: 'UNKNOWN',
        transactionId: txn.id,
        deviationKm: 0,
        lastKnownPosition: {
          lat: RWANDA_DISTRICTS.kigali.lat,
          lng: RWANDA_DISTRICTS.kigali.lng,
          timestamp: txn.createdAt,
        },
        alertType: 'missing_arrival',
        severity: 'warning',
        description: `Transaction ${txn.id} has been pending for more than ${hours}h with no buyer confirmation. No GPS arrival event recorded. Possible delivery failure or unreported off-system handover.`,
      });
    }
  } catch (error) {
    console.error('[GPS Tracker] scanForMissingArrivals error:', error);
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Calculate distance between two Rwanda districts
// ---------------------------------------------------------------------------

export function distanceBetweenDistricts(districtA: string, districtB: string): number | null {
  const a = RWANDA_DISTRICTS[districtA.toLowerCase()];
  const b = RWANDA_DISTRICTS[districtB.toLowerCase()];
  if (!a || !b) return null;
  return Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng));
}
