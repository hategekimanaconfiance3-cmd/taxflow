import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components';

interface TaxFlowEmailProps {
  verificationCode?: string;
  actionUrl?: string;
  actionText?: string;
  subject: string;
}

export default function TaxFlowEmail({
  verificationCode,
  actionUrl,
  actionText,
  subject,
}: TaxFlowEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>

      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <div style={logoWrapper}>
              <div style={logoIcon}>TF</div>
              <Text style={logoText}>TaxFlow</Text>
            </div>
          </Section>

          <Section style={content}>
            <Heading style={heading}>{subject}</Heading>

            <Text style={paragraph}>
              {verificationCode
                ? 'Use the code below to complete your verification process on TaxFlow.'
                : 'You requested a password reset. Click the button below to proceed.'}
            </Text>

            {verificationCode && (
              <Section style={codeWrapper}>
                <Text style={codeValue}>{verificationCode}</Text>
                <Text style={codeInfo}>(This code is valid for 10 minutes)</Text>
              </Section>
            )}

            {actionUrl && actionText && (
              <Section style={buttonWrapper}>
                <Button style={button} href={actionUrl}>
                  {actionText}
                </Button>
              </Section>
            )}

            {actionUrl && (
              <Text style={linkText}>
                Or copy and paste this link into your browser: <br />
                <a href={actionUrl} style={link}>
                  {actionUrl}
                </a>
              </Text>
            )}
          </Section>

          <Section style={footer}>
            <Text style={footerText}>© {new Date().getFullYear()} TaxFlow. All rights reserved.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: '#ffffff',
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  color: '#050505',
} as const;

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '560px',
} as const;

const header = {
  marginBottom: '32px',
  textAlign: 'center' as const,
} as const;

const logoWrapper = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
} as const;

const logoIcon = {
  backgroundColor: '#050505',
  color: '#ffffff',
  borderRadius: '8px',
  width: '32px',
  height: '32px',
  fontSize: '16px',
  fontWeight: 'bold',
  lineHeight: '32px',
  textAlign: 'center' as const,
  display: 'inline-block',
} as const;

const logoText = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#050505',
  margin: '0 0 0 12px',
  display: 'inline-block',
  verticalAlign: 'top',
  lineHeight: '32px',
} as const;

const content = {
  backgroundColor: '#ffffff',
  padding: '24px',
  borderRadius: '12px',
  border: '1px solid #eaeaea',
  textAlign: 'center' as const,
} as const;

const heading = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#050505',
  margin: '0 0 16px',
} as const;

const paragraph = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#444444',
  margin: '0 0 24px',
} as const;

const codeWrapper = {
  backgroundColor: '#f5f5f7',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
} as const;

const codeValue = {
  fontSize: '32px',
  fontWeight: 'bold',
  letterSpacing: '8px',
  color: '#050505',
  margin: '0 0 8px',
  fontFamily: 'monospace',
} as const;

const codeInfo = {
  fontSize: '13px',
  color: '#666666',
  margin: '0',
} as const;

const buttonWrapper = {
  margin: '24px 0',
} as const;

const button = {
  backgroundColor: '#050505',
  color: '#ffffff',
  borderRadius: '8px',
  padding: '12px 24px',
  fontSize: '16px',
  fontWeight: '500',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
} as const;

const linkText = {
  fontSize: '14px',
  color: '#666666',
  margin: '24px 0 0',
  wordBreak: 'break-all' as const,
} as const;

const link = {
  color: '#050505',
  textDecoration: 'underline',
} as const;

const footer = {
  marginTop: '32px',
  textAlign: 'center' as const,
} as const;

const footerText = {
  fontSize: '12px',
  color: '#888888',
  margin: '0',
} as const;
