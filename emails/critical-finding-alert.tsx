import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export interface CriticalFindingAlertProps {
  findingType: string;
  severity: 'critical' | 'warning';
  businessName: string;
  businessId: string;
  productName?: string | null;
  observedValue?: number | null;
  expectedValue?: number | null;
  explanation: string;
  dashboardUrl: string;
  officerName?: string | null;
}

export default function CriticalFindingAlert({
  findingType,
  severity,
  businessName,
  productName,
  observedValue,
  expectedValue,
  explanation,
  dashboardUrl,
  officerName,
}: CriticalFindingAlertProps) {
  const severityLabel = severity === 'critical' ? '🔴 CRITICAL' : '🟡 WARNING';
  const findingLabel = findingType.replace(/_/g, ' ').toUpperCase();

  return (
    <Html>
      <Head />
      <Preview>
        [{severityLabel}] AI Finding: {findingLabel} — {businessName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>TaxFlow AI — Compliance Finding Alert</Heading>

          <Section style={alertBox}>
            <Text style={alertTitle}>
              {severityLabel} · {findingLabel}
            </Text>
            <Text style={alertBusiness}>Business: {businessName}</Text>
            {productName && <Text style={metaText}>Product: {productName}</Text>}
            {observedValue != null && (
              <Text style={metaText}>Observed: {observedValue}</Text>
            )}
            {expectedValue != null && (
              <Text style={metaText}>Expected: {expectedValue}</Text>
            )}
          </Section>

          <Section>
            <Text style={sectionTitle}>Finding Summary</Text>
            <Text style={bodyText}>{explanation}</Text>
          </Section>

          <Section style={{ textAlign: 'center', marginTop: '24px' }}>
            <Button style={button} href={dashboardUrl}>
              Review in TaxFlow Dashboard
            </Button>
          </Section>

          <Hr style={hr} />

          <Section>
            {officerName && (
              <Text style={metaText}>Assigned to: {officerName}</Text>
            )}
            <Text style={disclaimer}>
              ⚠️ SYSTEM-GENERATED REVIEW SIGNAL — HUMAN OFFICER REVIEW REQUIRED.
              This alert was generated automatically by the TaxFlow AI monitoring system.
              It is a review signal only and does not constitute a tax assessment, penalty,
              enforcement action, or determination of wrongdoing. All findings must be
              reviewed and confirmed by a qualified RRA officer before any action is taken.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const main: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  padding: '32px',
  borderRadius: '8px',
};

const h1: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#18181b',
  marginBottom: '24px',
};

const alertBox: React.CSSProperties = {
  backgroundColor: '#fef2f2',
  border: '1px solid #fca5a5',
  borderRadius: '6px',
  padding: '16px',
  marginBottom: '24px',
};

const alertTitle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: '700',
  color: '#dc2626',
  margin: '0 0 8px 0',
};

const alertBusiness: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#27272a',
  margin: '0 0 4px 0',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#27272a',
  marginBottom: '8px',
};

const bodyText: React.CSSProperties = {
  fontSize: '14px',
  color: '#3f3f46',
  lineHeight: '1.6',
};

const metaText: React.CSSProperties = {
  fontSize: '13px',
  color: '#52525b',
  margin: '2px 0',
};

const button: React.CSSProperties = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  fontWeight: '600',
  fontSize: '14px',
  textDecoration: 'none',
  display: 'inline-block',
};

const hr: React.CSSProperties = {
  borderColor: '#e4e4e7',
  margin: '24px 0',
};

const disclaimer: React.CSSProperties = {
  fontSize: '12px',
  color: '#71717a',
  lineHeight: '1.5',
  fontStyle: 'italic',
};
