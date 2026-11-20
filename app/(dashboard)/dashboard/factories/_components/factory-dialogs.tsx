'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { registerFactory, registerGateway, registerProductionLine } from '@/lib/actions/industrial-factory.action';

type Msg = { type: 'success' | 'error'; text: string };

function InlineMessage({ msg }: { msg: Msg | null }) {
  if (!msg) return null;
  return (
    <p className={`text-xs px-1 ${msg.type === 'success' ? 'text-green-600' : 'text-destructive'}`}>
      {msg.text}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Register Factory Dialog
// ---------------------------------------------------------------------------
export function RegisterFactoryDialog({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: '', location: '', province: '', district: '', registrationNumber: '', notes: '' });
  const [msg, setMsg] = useState<Msg | null>(null);

  function handleSubmit() {
    if (!form.name.trim() || !form.location.trim()) {
      setMsg({ type: 'error', text: 'Factory name and location are required' });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const result = await registerFactory({
        name: form.name.trim(),
        location: form.location.trim(),
        province: form.province.trim() || undefined,
        district: form.district.trim() || undefined,
        registrationNumber: form.registrationNumber.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      if (result.success) {
        setMsg({ type: 'success', text: 'Factory registered — pending admin approval' });
        setForm({ name: '', location: '', province: '', district: '', registrationNumber: '', notes: '' });
        onSuccess?.();
        setTimeout(() => { setOpen(false); setMsg(null); }, 1500);
      } else {
        setMsg({ type: 'error', text: result.error ?? 'Failed to register factory' });
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Register New Factory</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Register New Factory</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Factory Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Kigali Production Plant A" />
            </div>
            <div className="space-y-1">
              <Label>Location / Address *</Label>
              <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="KG 123 St, Kigali" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Province</Label>
                <Input value={form.province} onChange={e => setForm(f => ({ ...f, province: e.target.value }))} placeholder="Kigali" />
              </div>
              <div className="space-y-1">
                <Label>District</Label>
                <Input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} placeholder="Gasabo" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Registration Number</Label>
              <Input value={form.registrationNumber} onChange={e => setForm(f => ({ ...f, registrationNumber: e.target.value }))} placeholder="Optional factory reg. number" />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
            </div>
            <InlineMessage msg={msg} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={pending}>{pending ? 'Registering…' : 'Register Factory'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Register Gateway Dialog
// ---------------------------------------------------------------------------
export function RegisterGatewayDialog({ factories }: { factories: Array<{ id: string; name: string; status: string }> }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ factoryId: '', name: '', protocol: 'https' as 'https' | 'mqtt' | 'opc_ua' });
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);

  const approvedFactories = factories.filter(f => f.status === 'approved');

  function handleSubmit() {
    if (!form.factoryId || !form.name.trim()) {
      setMsg({ type: 'error', text: 'Factory and gateway name are required' });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const result = await registerGateway({ factoryId: form.factoryId, name: form.name.trim(), protocol: form.protocol });
      if (result.success) {
        setApiKey(result.data.apiKey);
      } else {
        setMsg({ type: 'error', text: result.error ?? 'Failed to register gateway' });
      }
    });
  }

  function handleClose() {
    setOpen(false);
    setApiKey(null);
    setMsg(null);
    setForm({ factoryId: '', name: '', protocol: 'https' });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={approvedFactories.length === 0}>
        Register Gateway
      </Button>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Register Industrial Gateway</DialogTitle></DialogHeader>
          {apiKey ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                <p className="text-sm font-semibold text-amber-900 mb-2">⚠️ Save this API key — it will never be shown again</p>
                <code className="block text-xs font-mono break-all bg-white border border-amber-200 rounded p-3 text-amber-900">{apiKey}</code>
              </div>
              <p className="text-sm text-muted-foreground">Configure your gateway device with this key. The gateway is pending admin approval.</p>
              <div className="rounded bg-muted p-3 text-xs text-muted-foreground">
                <p className="font-medium mb-1">Gateway API endpoint:</p>
                <code>POST https://taxflow-five.vercel.app/api/industrial/events</code>
                <br />
                <code>Authorization: Bearer {'<your-api-key>'}</code>
              </div>
              <Button onClick={handleClose} className="w-full">I have saved the API key</Button>
            </div>
          ) : (
            <>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label>Factory *</Label>
                  <Select value={form.factoryId} onValueChange={v => setForm(f => ({ ...f, factoryId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select approved factory" /></SelectTrigger>
                    <SelectContent>
                      {approvedFactories.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Gateway Name *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Line A Gateway" />
                </div>
                <div className="space-y-1">
                  <Label>Protocol</Label>
                  <Select value={form.protocol} onValueChange={v => setForm(f => ({ ...f, protocol: v as typeof form.protocol }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="https">HTTPS</SelectItem>
                      <SelectItem value="mqtt">MQTT</SelectItem>
                      <SelectItem value="opc_ua">OPC-UA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <InlineMessage msg={msg} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleClose} disabled={pending}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={pending}>{pending ? 'Registering…' : 'Generate API Key'}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Register Production Line Dialog
// ---------------------------------------------------------------------------
export function RegisterProductionLineDialog({ factories }: { factories: Array<{ id: string; name: string; status: string }> }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ factoryId: '', name: '', lineCode: '', description: '', capacity: '', capacityUnit: '' });
  const [msg, setMsg] = useState<Msg | null>(null);

  const approvedFactories = factories.filter(f => f.status === 'approved');

  function handleSubmit() {
    if (!form.factoryId || !form.name.trim() || !form.lineCode.trim()) {
      setMsg({ type: 'error', text: 'Factory, line name and line code are required' });
      return;
    }
    if (!/^[A-Z0-9_-]+$/.test(form.lineCode.trim())) {
      setMsg({ type: 'error', text: 'Line code must be uppercase letters, digits, hyphens or underscores' });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const result = await registerProductionLine({
        factoryId: form.factoryId,
        name: form.name.trim(),
        lineCode: form.lineCode.trim(),
        description: form.description.trim() || undefined,
        capacity: form.capacity ? parseFloat(form.capacity) : undefined,
        capacityUnit: form.capacityUnit.trim() || undefined,
      });
      if (result.success) {
        setMsg({ type: 'success', text: 'Production line registered' });
        setForm({ factoryId: '', name: '', lineCode: '', description: '', capacity: '', capacityUnit: '' });
        setTimeout(() => { setOpen(false); setMsg(null); }, 1500);
      } else {
        setMsg({ type: 'error', text: result.error ?? 'Failed to register production line' });
      }
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={approvedFactories.length === 0}>
        Add Production Line
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Register Production Line</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Factory *</Label>
              <Select value={form.factoryId} onValueChange={v => setForm(f => ({ ...f, factoryId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select approved factory" /></SelectTrigger>
                <SelectContent>
                  {approvedFactories.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Line Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Bottling Line A" />
            </div>
            <div className="space-y-1">
              <Label>Line Code * <span className="text-xs text-muted-foreground">(uppercase, e.g. LINE-A)</span></Label>
              <Input value={form.lineCode} onChange={e => setForm(f => ({ ...f, lineCode: e.target.value.toUpperCase() }))} placeholder="LINE-A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Capacity</Label>
                <Input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="e.g. 1000" />
              </div>
              <div className="space-y-1">
                <Label>Capacity Unit</Label>
                <Input value={form.capacityUnit} onChange={e => setForm(f => ({ ...f, capacityUnit: e.target.value }))} placeholder="units/hr" />
              </div>
            </div>
            <InlineMessage msg={msg} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={pending}>{pending ? 'Registering…' : 'Add Line'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
