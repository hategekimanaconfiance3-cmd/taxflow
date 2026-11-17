'use client';

import { useState } from 'react';

interface FactoryOption { id: string; name: string; factoryCode: string; }
interface LineOption { id: string; factoryId: string; name: string; lineCode: string; }
interface EquipmentSummary { id: string; factoryId: string; productionLineId: string; equipmentCode: string; name: string; equipmentType: string; operationalStatus: string; calibrationStatus: string; lastCommunicationAt: string | Date | null; }
interface GatewaySummary { id: string; factoryId: string; gatewayCode: string; name: string; status: string; lastHeartbeatAt: string | Date | null; }
interface IntegrationRequestSummary { id: string; factoryId: string; environment: string; integrationName: string; status: string; createdAt: string | Date; }
interface IntegrationSummary { integration: { id: string; factoryId: string; integrationCode: string; environment: string; status: string; requiresCredentialReissue: boolean; }; gateway: GatewaySummary | null; }

interface Props {
  factories: FactoryOption[];
  lines: LineOption[];
  equipment: EquipmentSummary[];
  gateways: GatewaySummary[];
  integrationRequests: IntegrationRequestSummary[];
  integrations: IntegrationSummary[];
}

export function IndustrialManagement({ factories, lines, equipment: initialEquipment, gateways: initialGateways, integrationRequests: initialIntegrationRequests, integrations: initialIntegrations }: Props) {
  const [equipment, setEquipment] = useState(initialEquipment);
  const [gateways, setGateways] = useState(initialGateways);
  const [integrationRequests, setIntegrationRequests] = useState(initialIntegrationRequests);
  const [integrations] = useState(initialIntegrations);
  const [factoryId, setFactoryId] = useState(factories[0]?.id ?? '');
  const [lineId, setLineId] = useState(lines.find((line) => line.factoryId === factoryId)?.id ?? '');
  const [equipmentCode, setEquipmentCode] = useState('');
  const [equipmentName, setEquipmentName] = useState('');
  const [equipmentType, setEquipmentType] = useState('filling_machine');
  const [gatewayCode, setGatewayCode] = useState('');
  const [gatewayName, setGatewayName] = useState('');
  const [integrationName, setIntegrationName] = useState('');
  const [integrationEnvironment, setIntegrationEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [credentialPackage, setCredentialPackage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const factoryLines = lines.filter((line) => line.factoryId === factoryId);
  const factoryEquipment = equipment.filter((item) => item.factoryId === factoryId);

  async function registerEquipment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const response = await fetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ factoryId, productionLineId: lineId, equipmentCode, name: equipmentName, equipmentType, communicationProtocol: 'unknown', integrationMethod: 'gateway' }) });
      const result: { equipment?: EquipmentSummary; error?: string } = await response.json();
      if (!response.ok || !result.equipment) throw new Error(result.error ?? 'Equipment registration failed.');
      setEquipment((current) => [result.equipment!, ...current]); setEquipmentCode(''); setEquipmentName(''); setMessage('Equipment registered. Record calibration evidence before enabling production integration.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Equipment registration failed.'); } finally { setBusy(false); }
  }

  async function registerGateway(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null); setSecret(null);
    try {
      const response = await fetch('/api/industrial/gateways', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ factoryId, gatewayCode, name: gatewayName }) });
      const result: { registration?: { gateway: GatewaySummary; clientSecret: string }; error?: string } = await response.json();
      if (!response.ok || !result.registration) throw new Error(result.error ?? 'Gateway registration failed.');
      setGateways((current) => [result.registration!.gateway, ...current]); setSecret(result.registration.clientSecret); setGatewayCode(''); setGatewayName(''); setMessage('Gateway created in pending status. Store the secret securely; it will not be shown again.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gateway registration failed.'); } finally { setBusy(false); }
  }

  async function rotateGateway(gatewayId: string) {
    setBusy(true); setSecret(null); setMessage(null);
    try {
      const response = await fetch(`/api/industrial/gateways/${gatewayId}/rotate`, { method: 'POST' });
      const result: { credential?: { clientSecret: string }; error?: string } = await response.json();
      if (!response.ok || !result.credential) throw new Error(result.error ?? 'Credential rotation failed.');
      setSecret(result.credential.clientSecret); setMessage('Gateway credential rotated. The previous credential is revoked.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Credential rotation failed.'); } finally { setBusy(false); }
  }

  async function requestIntegration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const response = await fetch('/api/industrial/integration-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ factoryId, environment: integrationEnvironment, integrationName, requestedEquipmentIds: selectedEquipmentIds, clientRequestId: crypto.randomUUID() }) });
      const result: { request?: IntegrationRequestSummary; error?: string } = await response.json();
      if (!response.ok || !result.request) throw new Error(result.error ?? 'Integration request failed.');
      setIntegrationRequests((current) => [result.request!, ...current]); setIntegrationName(''); setSelectedEquipmentIds([]); setMessage('Integration request submitted to TF. Provisioning remains locked until approval.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Integration request failed.'); } finally { setBusy(false); }
  }

  async function claimCredentials(integrationId: string) {
    setBusy(true); setMessage(null); setCredentialPackage(null);
    try {
      const response = await fetch(`/api/industrial/integrations/${integrationId}/credentials/claim`, { method: 'POST' });
      const result: { credentials?: Record<string, unknown>; error?: string } = await response.json();
      if (!response.ok || !result.credentials) throw new Error(result.error ?? 'Credentials could not be claimed.');
      setCredentialPackage(JSON.stringify(result.credentials, null, 2)); setMessage('Credentials claimed once. Store the secret and signing key securely; TaxFlow will not show them again.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Credentials could not be claimed.'); } finally { setBusy(false); }
  }

  async function loadIntegrationPackage(integrationId: string) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/industrial/integrations/${integrationId}/package`);
      const result: { package?: Record<string, unknown>; error?: string } = await response.json();
      if (!response.ok || !result.package) throw new Error(result.error ?? 'Integration package could not be loaded.');
      setCredentialPackage(JSON.stringify(result.package, null, 2));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Integration package could not be loaded.'); } finally { setBusy(false); }
  }

  return <div className="space-y-8">
    <div><h1 className="text-2xl font-bold tracking-tight">Industrial integration</h1><p className="mt-1 text-sm text-muted-foreground">Register equipment and gateways as evidence sources. They do not post stock or tax outcomes.</p></div>
    {message && <div role="status" className="rounded-md border bg-muted/30 px-4 py-3 text-sm">{message}</div>}
    {secret && <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm"><p className="font-semibold">Gateway client secret — display once</p><code className="mt-2 block break-all">{secret}</code></div>}
    <section className="rounded-lg border bg-card p-6"><h2 className="text-lg font-semibold">Register equipment</h2><form onSubmit={registerEquipment} className="mt-4 grid gap-4 md:grid-cols-4">
      <label className="grid gap-1 text-sm">Factory<select required value={factoryId} onChange={(event) => { setFactoryId(event.target.value); setLineId(lines.find((line) => line.factoryId === event.target.value)?.id ?? ''); }} className="h-10 rounded-md border bg-background px-3">{factories.map((factory) => <option key={factory.id} value={factory.id}>{factory.factoryCode} — {factory.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Production line<select required value={lineId} onChange={(event) => setLineId(event.target.value)} className="h-10 rounded-md border bg-background px-3">{factoryLines.map((line) => <option key={line.id} value={line.id}>{line.lineCode} — {line.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Equipment code<input required value={equipmentCode} onChange={(event) => setEquipmentCode(event.target.value)} className="h-10 rounded-md border bg-background px-3" placeholder="FILLER-01" /></label>
      <label className="grid gap-1 text-sm">Equipment type<input required value={equipmentType} onChange={(event) => setEquipmentType(event.target.value)} className="h-10 rounded-md border bg-background px-3" /></label>
      <label className="grid gap-1 text-sm md:col-span-2">Equipment name<input required value={equipmentName} onChange={(event) => setEquipmentName(event.target.value)} className="h-10 rounded-md border bg-background px-3" placeholder="PET filling machine" /></label>
      <button disabled={busy || !lineId} type="submit" className="h-10 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">Register equipment</button>
    </form></section>
    <section className="rounded-lg border bg-card p-6"><h2 className="text-lg font-semibold">Register gateway</h2><form onSubmit={registerGateway} className="mt-4 grid gap-4 md:grid-cols-4">
      <label className="grid gap-1 text-sm">Factory<select required value={factoryId} onChange={(event) => setFactoryId(event.target.value)} className="h-10 rounded-md border bg-background px-3">{factories.map((factory) => <option key={factory.id} value={factory.id}>{factory.factoryCode} — {factory.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Gateway code<input required value={gatewayCode} onChange={(event) => setGatewayCode(event.target.value)} className="h-10 rounded-md border bg-background px-3" placeholder="GW-01" /></label>
      <label className="grid gap-1 text-sm">Gateway name<input required value={gatewayName} onChange={(event) => setGatewayName(event.target.value)} className="h-10 rounded-md border bg-background px-3" placeholder="Plant edge gateway" /></label>
      <button disabled={busy || !factoryId} type="submit" className="h-10 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">Register gateway</button>
    </form></section>
    <section className="rounded-lg border bg-card p-6"><h2 className="text-lg font-semibold">Request TF-managed integration</h2><p className="mt-1 text-sm text-muted-foreground">TF provisions the factory-specific gateway and credentials only after factory approval and equipment authorization.</p><form onSubmit={requestIntegration} className="mt-4 grid gap-4 md:grid-cols-4">
      <label className="grid gap-1 text-sm md:col-span-2">Integration name<input required value={integrationName} onChange={(event) => setIntegrationName(event.target.value)} className="h-10 rounded-md border bg-background px-3" placeholder="Main production integration" /></label>
      <label className="grid gap-1 text-sm">Environment<select value={integrationEnvironment} onChange={(event) => setIntegrationEnvironment(event.target.value as 'sandbox' | 'production')} className="h-10 rounded-md border bg-background px-3"><option value="sandbox">Sandbox</option><option value="production">Production</option></select></label>
      <label className="grid gap-1 text-sm">Factory<select required value={factoryId} onChange={(event) => { setFactoryId(event.target.value); setSelectedEquipmentIds([]); }} className="h-10 rounded-md border bg-background px-3">{factories.map((factory) => <option key={factory.id} value={factory.id}>{factory.factoryCode} — {factory.name}</option>)}</select></label>
      <fieldset className="grid gap-2 text-sm md:col-span-3"><legend className="font-medium">Authorized equipment</legend>{factoryEquipment.length === 0 && <p className="text-muted-foreground">Register equipment before requesting an integration.</p>}{factoryEquipment.map((item) => <label key={item.id} className="flex items-center gap-2"><input type="checkbox" checked={selectedEquipmentIds.includes(item.id)} onChange={(event) => setSelectedEquipmentIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />{item.equipmentCode} — {item.name} <span className="text-muted-foreground">({item.operationalStatus})</span></label>)}</fieldset>
      <button disabled={busy || !factoryId || selectedEquipmentIds.length === 0} type="submit" className="h-10 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">Submit integration request</button>
    </form><div className="mt-5 grid gap-2">{integrationRequests.map((item) => <div key={item.id} className="rounded-md border p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{item.integrationName} · {item.environment}</span><span className="capitalize text-muted-foreground">{item.status}</span></div><p className="mt-1 text-xs text-muted-foreground">Submitted {new Date(item.createdAt).toLocaleString()}</p></div>)}{integrationRequests.length === 0 && <p className="text-sm text-muted-foreground">No TF integration requests yet.</p>}</div></section>
    <section className="rounded-lg border bg-card p-6"><h2 className="text-lg font-semibold">TF-managed integrations</h2><div className="mt-3 grid gap-2">{integrations.map((item) => <div key={item.integration.id} className="rounded-md border p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{item.integration.integrationCode}</span><span className="capitalize text-muted-foreground">{item.integration.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{item.integration.environment} · {item.gateway?.gatewayCode ?? 'Gateway provisioning pending'}{item.integration.requiresCredentialReissue ? ' · credential claim required' : ''}</p><div className="mt-2 flex gap-2"><button disabled={busy || item.integration.status === 'revoked'} onClick={() => claimCredentials(item.integration.id)} className="rounded-md border px-2 py-1 text-xs disabled:opacity-50">Claim credentials</button><button disabled={busy} onClick={() => loadIntegrationPackage(item.integration.id)} className="rounded-md border px-2 py-1 text-xs disabled:opacity-50">View package</button></div></div>)}{integrations.length === 0 && <p className="text-sm text-muted-foreground">Approved integrations will appear here.</p>}</div>{credentialPackage && <pre className="mt-4 max-h-72 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">{credentialPackage}</pre>}</section>
    <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-lg border bg-card p-5"><h2 className="font-semibold">Equipment registry</h2><div className="mt-3 space-y-2">{equipment.map((item) => <div key={item.id} className="rounded-md border p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{item.equipmentCode} — {item.name}</span><span className="capitalize text-muted-foreground">{item.operationalStatus}</span></div><p className="mt-1 text-xs text-muted-foreground">Calibration: {item.calibrationStatus} · Last communication: {item.lastCommunicationAt ? new Date(item.lastCommunicationAt).toLocaleString() : 'none'}</p></div>)}{equipment.length === 0 && <p className="text-sm text-muted-foreground">No equipment registered.</p>}</div></div>
      <div className="rounded-lg border bg-card p-5"><h2 className="font-semibold">Gateway management</h2><div className="mt-3 space-y-2">{gateways.map((item) => <div key={item.id} className="rounded-md border p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{item.gatewayCode} — {item.name}</span><span className="capitalize text-muted-foreground">{item.status}</span></div><p className="mt-1 text-xs text-muted-foreground">Last heartbeat: {item.lastHeartbeatAt ? new Date(item.lastHeartbeatAt).toLocaleString() : 'none'}</p><button disabled={busy || item.status === 'revoked'} onClick={() => rotateGateway(item.id)} className="mt-2 rounded-md border px-2 py-1 text-xs disabled:opacity-50">Rotate credential</button></div>)}{gateways.length === 0 && <p className="text-sm text-muted-foreground">No gateways registered.</p>}</div></div></section>
  </div>;
}
